const fs = require('fs');
const file = 'src/auth/Login.tsx';
let content = fs.readFileSync(file, 'utf8');

// Replace text colors
content = content.replace(/text-zinc-800/g, 'text-zinc-800 dark:text-zinc-100');
content = content.replace(/text-zinc-500/g, 'text-zinc-500 dark:text-zinc-400');
// Be careful with text-zinc-400, it might already have dark:text-zinc-500
content = content.replace(/text-zinc-400(?! dark:)/g, 'text-zinc-400 dark:text-zinc-500');
content = content.replace(/text-zinc-600(?! dark:)/g, 'text-zinc-600 dark:text-zinc-300');

// Replace background colors
content = content.replace(/bg-zinc-100(?! dark:)/g, 'bg-zinc-100 dark:bg-zinc-800');
content = content.replace(/hover:bg-zinc-200(?! dark:)/g, 'hover:bg-zinc-200 dark:hover:bg-zinc-700');

// Replace border colors
content = content.replace(/border-zinc-100(?! dark:)/g, 'border-zinc-100 dark:border-zinc-800');
content = content.replace(/border-zinc-200(?! dark:)/g, 'border-zinc-200 dark:border-zinc-700');

fs.writeFileSync(file, content);
