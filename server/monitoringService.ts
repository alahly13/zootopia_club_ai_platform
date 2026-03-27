import { Firestore } from 'firebase-admin/firestore';
import { logDiagnostic, normalizeError } from './diagnostics';

export async function getProviderUsageHistory(db: Firestore, provider?: string, limit: number = 100) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  let query = db.collection('providerUsage').orderBy('timestamp', 'desc').limit(safeLimit);
  
  if (provider) {
    query = db.collection('providerUsage').where('provider', '==', provider).orderBy('timestamp', 'desc').limit(safeLimit);
  }

  try {
    const snapshot = await query.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    logDiagnostic('error', 'monitoring.provider_usage_history_failed', {
      area: 'monitoring',
      stage: 'getProviderUsageHistory',
      provider,
      details: normalizeError(error),
    });
    throw error;
  }
}

export async function getAggregatedUsage(db: Firestore) {
  try {
    const snapshot = await db.collection('providerUsage').get();
    const usage: Record<string, any> = {};

    snapshot.forEach(doc => {
      const data = doc.data();
      const provider = (data.provider || 'unknown').toString();
      if (!usage[provider]) {
        usage[provider] = { totalTokens: 0, count: 0 };
      }
      usage[provider].totalTokens += Number(data.usage?.totalTokens || 0);
      usage[provider].count += 1;
    });

    return usage;
  } catch (error) {
    logDiagnostic('error', 'monitoring.aggregate_usage_failed', {
      area: 'monitoring',
      stage: 'getAggregatedUsage',
      details: normalizeError(error),
    });
    throw error;
  }
}
