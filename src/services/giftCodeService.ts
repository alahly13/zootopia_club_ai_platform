import { db } from '../firebase';
import { doc, getDoc, updateDoc, arrayUnion, serverTimestamp, collection, addDoc, query, where, getDocs, deleteDoc, setDoc } from 'firebase/firestore';

export const redeemGiftCode = async (userId: string, code: string) => {
  const codesRef = collection(db, 'giftCodes');
  const q = query(codesRef, where('code', '==', code), where('isActive', '==', true));
  const querySnapshot = await getDocs(q);

  if (querySnapshot.empty) {
    throw new Error('Invalid or inactive gift code.');
  }

  const codeDoc = querySnapshot.docs[0];
  const codeData = codeDoc.data();

  if (codeData.redeemedBy?.includes(userId)) {
    throw new Error('You have already redeemed this code.');
  }

  // Grant credits
  const userRef = doc(db, 'users', userId);
  const userDoc = await getDoc(userRef);
  if (!userDoc.exists()) throw new Error('User not found.');

  await updateDoc(userRef, {
    credits: (userDoc.data().credits || 0) + codeData.amount
  });

  // Track redemption
  await updateDoc(codeDoc.ref, {
    redeemedBy: arrayUnion(userId)
  });

  return codeData.amount;
};

export const getGiftCodes = async () => {
  const codesRef = collection(db, 'giftCodes');
  const querySnapshot = await getDocs(codesRef);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const createGiftCode = async (code: string, amount: number, isActive: boolean) => {
  const codesRef = collection(db, 'giftCodes');
  await addDoc(codesRef, {
    code,
    amount,
    isActive,
    redeemedBy: [],
    createdAt: serverTimestamp()
  });
};

export const updateGiftCode = async (id: string, data: any) => {
  const codeRef = doc(db, 'giftCodes', id);
  await updateDoc(codeRef, data);
};

export const deleteGiftCode = async (id: string) => {
  const codeRef = doc(db, 'giftCodes', id);
  await deleteDoc(codeRef);
};
