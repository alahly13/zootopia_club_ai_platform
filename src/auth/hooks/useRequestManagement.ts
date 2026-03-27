import { User, UserRequest, Activity } from '../../utils';
import { doc, setDoc, getDoc, runTransaction } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { logger } from '../../utils/logger';
import toast from 'react-hot-toast';

export function useRequestManagement(
  user: User | null,
  userRequests: UserRequest[],
  logActivity: (type: Activity['type'], description: string, status?: Activity['status'], metadata?: any) => void,
  handleError: (error: any, category: any, context?: string, uiType?: 'toast' | 'alert' | 'modal') => void
) {
  const submitRequest = async (type: UserRequest['type'], message: string, requestedAmount?: number, targetId?: string) => {
    if (!user) return;
    
    // Check for existing pending request of the same type and target
    const existingPending = userRequests.find(r => 
      r.userId === user.id && 
      r.type === type && 
      r.status === 'Pending' &&
      (targetId ? (r.targetPage === targetId || r.targetModel === targetId || r.targetProject === targetId) : true)
    );
    if (existingPending) {
      toast.error('You already have a pending request of this type.');
      return;
    }

    try {
      const newRequest: UserRequest = {
        id: `req-${Date.now()}`,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        type,
        message,
        status: 'Pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        requestedAmount,
        targetPage: type === 'Page Access' ? targetId : undefined,
        targetModel: type === 'Model Access' ? targetId : undefined,
        targetProject: type === 'Project Join' ? targetId : undefined
      };
      await setDoc(doc(db, 'requests', newRequest.id), newRequest);
      logActivity('chat', `Submitted request: ${type}${requestedAmount ? ` (${requestedAmount} credits)` : ''}`);
      toast.success('Request submitted successfully');
      
      // Notify Admin
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) {
          throw new Error('Missing authentication token for admin notification');
        }

        const response = await fetch('/api/notifications/admin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            userId: user.id,
            amount: requestedAmount,
            type: type,
            subject: `New ${type} from ${user.name}`,
            message: `User ${user.name} (${user.email}) submitted a ${type}.\n\nMessage: ${message}\n${requestedAmount ? `Requested Amount: ${requestedAmount}` : ''}`
          })
        });
        const result = await response.json();
        if (!result.success) {
          logger.error('Failed to send admin notification', { error: result.error });
        }
      } catch (e) {
        logger.error('Failed to send admin notification', e);
      }
    } catch (error) {
      handleError(error, 'request_update', 'Failed to submit request', 'toast');
    }
  };

  const updateRequest = async (requestId: string, status: UserRequest['status'], adminResponse?: string, approvedAmount?: number) => {
    try {
      await runTransaction(db, async (transaction) => {
        const reqRef = doc(db, 'requests', requestId);
        const reqSnap = await transaction.get(reqRef);
        if (!reqSnap.exists()) throw new Error('Request not found');
        const request = reqSnap.data() as UserRequest;

        if (request.status !== 'Pending') {
          throw new Error('This request has already been processed.');
        }

        const updates: any = { 
          status, 
          adminResponse, 
          updatedAt: new Date().toISOString() 
        };

        if (status === 'Approved' || status === 'Modified') {
          const userDocRef = doc(db, 'users', request.userId);
          const userSnap = await transaction.get(userDocRef);
          
          if (request.type === 'Page Access') {
            if (userSnap.exists() && request.targetPage) {
              const userData = userSnap.data() as User;
              const currentUnlocked = userData.unlockedPages || [];
              if (!currentUnlocked.includes(request.targetPage)) {
                transaction.update(userDocRef, {
                  unlockedPages: [...currentUnlocked, request.targetPage]
                });
                logActivity('admin_action', `Admin ${status.toLowerCase()} page access request for ${userData.email}: ${request.targetPage}`);
              }
            }
          } else if (request.type === 'Project Join') {
            if (userSnap.exists() && request.targetProject) {
              const userData = userSnap.data() as User;
              const currentUnlocked = userData.unlockedProjects || [];
              if (!currentUnlocked.includes(request.targetProject)) {
                transaction.update(userDocRef, {
                  unlockedProjects: [...currentUnlocked, request.targetProject]
                });
                logActivity('admin_action', `Admin ${status.toLowerCase()} project join request for ${userData.email}: ${request.targetProject}`);
              }
            }
          } else if (request.type === 'Premium Access') {
            if (userSnap.exists()) {
              transaction.update(userDocRef, {
                plan: 'pro'
              });
              logActivity('admin_action', `Admin ${status.toLowerCase()} premium access request for ${request.userEmail}`);
            }
          } else if (request.type === 'Model Access' || request.type === 'Chat Unlock' || request.type === 'Secrets Access') {
            if (userSnap.exists()) {
              const userData = userSnap.data() as User;
              updates.unlockCode = 'PENDING_BACKEND_ISSUANCE';
              logActivity('admin_action', `Admin ${status.toLowerCase()} ${request.type} request for ${userData.email} (backend code issuance pending)`);
            }
          } else {
            const finalAmount = approvedAmount !== undefined ? approvedAmount : (request.requestedAmount || 0);
            updates.approvedAmount = finalAmount;
            
            // Update user credits
            if (userSnap.exists()) {
              const userData = userSnap.data() as User;
              const currentCredits = Number(userData.credits) || 0;
              const addedCredits = Number(finalAmount) || 0;
              transaction.update(userDocRef, {
                credits: currentCredits + addedCredits
              });
              logActivity('admin_action', `Admin ${status.toLowerCase()} credit request for ${userData.email}: +${addedCredits} credits`);
            }
          }
        }

        transaction.update(reqRef, updates);
      });
      toast.success(`Request ${status.toLowerCase()}`);

      if (status === 'Approved' || status === 'Modified') {
        const reqRef = doc(db, 'requests', requestId);
        const reqSnap = await getDoc(reqRef);
        const requestData = reqSnap.exists() ? (reqSnap.data() as UserRequest) : null;

        if (
          requestData &&
          requestData.unlockCode === 'PENDING_BACKEND_ISSUANCE' &&
          (requestData.type === 'Model Access' || requestData.type === 'Chat Unlock' || requestData.type === 'Secrets Access')
        ) {
          const token = await auth.currentUser?.getIdToken();
          if (!token) {
            throw new Error('Missing authentication token for backend code issuance');
          }

          const purpose =
            requestData.type === 'Model Access'
              ? 'model-unlock'
              : requestData.type === 'Chat Unlock'
                ? 'chat-unlock'
                : 'secrets-access';

          const response = await fetch('/api/admin/generate-code', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              purpose,
              usageMode: 'single-use',
              neverExpires: true,
              recipientUserId: requestData.userId,
              metadata: {
                targetId: requestData.targetModel || requestData.targetPage || null,
                issuedForRequestId: requestData.id,
                migratedFromLegacyUnlockCodes: true,
              },
            }),
          });

          const json = await response.json().catch(() => ({}));
          if (!response.ok || !json?.code) {
            throw new Error(json?.error || 'Failed to issue backend unlock code');
          }

          await setDoc(reqRef, {
            unlockCode: json.code,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
        }
      }
      
      // Notify User
      try {
        const reqSnap = await getDoc(doc(db, 'requests', requestId));
        if (reqSnap.exists()) {
          const requestData = reqSnap.data() as UserRequest;
          const userDocRef = doc(db, 'users', requestData.userId);
          const userSnap = await getDoc(userDocRef);
          const userEmail = userSnap.exists() ? (userSnap.data() as User).email : undefined;

          const token = await auth.currentUser?.getIdToken();
          if (!token) {
            throw new Error('Missing authentication token for user notification');
          }

          const response = await fetch('/api/notifications/user', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              userId: requestData.userId,
              userEmail: userEmail,
              subject: `Request ${status}`,
              message: `Your request for ${requestData.type} has been ${status.toLowerCase()}.\n\nAdmin Response: ${adminResponse || 'No message'}${requestData.unlockCode ? `\n\nYour Unlock Code: ${requestData.unlockCode}\nYou can use this code to unlock the requested model.` : ''}`
            })
          });
          const result = await response.json();
          if (!result.success) {
            logger.error('Failed to send user notification', { error: result.error });
          }
        }
      } catch (e) {
        logger.error('Failed to send user notification', e);
      }
    } catch (error) {
      handleError(error, 'request_update', 'Failed to update request', 'toast');
    }
  };

  return {
    submitRequest,
    updateRequest
  };
}
