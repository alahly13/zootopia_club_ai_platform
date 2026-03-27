const fs = require('fs');
const file = 'src/auth/Login.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/bg-zinc-50 border-2 border-zinc-100/g, 'bg-zinc-50 dark:bg-zinc-800/50 border-2 border-zinc-100 dark:border-zinc-700/50 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500');

content = content.replace(/"w-full bg-zinc-50 border-2 rounded-2xl py-3.5 pl-12 pr-10 focus:outline-none transition-all font-medium text-sm",/g, '"w-full bg-zinc-50 dark:bg-zinc-800/50 border-2 rounded-2xl py-3.5 pl-12 pr-10 focus:outline-none transition-all font-medium text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500",');

content = content.replace(/"w-full bg-zinc-50 border-2 rounded-2xl py-3.5 pl-12 pr-4 focus:outline-none transition-all font-medium text-sm",/g, '"w-full bg-zinc-50 dark:bg-zinc-800/50 border-2 rounded-2xl py-3.5 pl-12 pr-4 focus:outline-none transition-all font-medium text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500",');

fs.writeFileSync(file, content);
