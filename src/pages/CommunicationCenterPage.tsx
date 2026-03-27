import * as React from 'react';
import { CommunicationCenter } from '../admin/components/CommunicationCenter';
import { motion } from 'motion/react';

const CommunicationCenterPage: React.FC = () => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-8 max-w-7xl mx-auto"
    >
      <h1 className="text-3xl font-bold text-zinc-900 dark:text-white mb-8">Communication Center</h1>
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
        <CommunicationCenter />
      </div>
    </motion.div>
  );
};

export default CommunicationCenterPage;
