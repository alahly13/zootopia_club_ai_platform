import * as React from 'react';
import { CodeManager } from '../components/CodeManager';

export const CodeManagementPage: React.FC = () => {
  return (
    <div className="p-8 space-y-8">
      <h1 className="text-3xl font-black text-zinc-900 dark:text-white uppercase tracking-tighter">Code Management</h1>
      <CodeManager />
    </div>
  );
};
