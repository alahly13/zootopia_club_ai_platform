const fs = require('fs');
const file = 'src/auth/Login.tsx';
let content = fs.readFileSync(file, 'utf8');

const replacements = {
  'placeholder="Email or @username"': "placeholder={t('emailOrUsernamePlaceholder')}",
  'placeholder="••••••••"': "placeholder={t('passwordPlaceholder')}",
  'placeholder="unique_username"': "placeholder={t('usernamePlaceholder')}",
  'placeholder="student@university.edu"': "placeholder={t('emailPlaceholder')}",
  'placeholder="Min 8 chars"': "placeholder={t('min8Chars')}",
  'placeholder="Repeat password"': "placeholder={t('repeatPassword')}",
  'placeholder="e.g. Ahmed Ali"': "placeholder={t('fullNamePlaceholder')}",
  'placeholder="Select Country"': "placeholder={t('selectCountry')}",
  'placeholder="Select Nationality"': "placeholder={t('selectNationality')}",
  'placeholder="Number only"': "placeholder={t('numberOnly')}",
  'placeholder="Max 8 digits"': "placeholder={t('max8Digits')}",
  'placeholder="e.g. Zoology"': "placeholder={t('departmentPlaceholder')}",
  'placeholder="Admin ID"': "placeholder={t('adminIdPlaceholder')}",
};

for (const [key, value] of Object.entries(replacements)) {
  content = content.replace(new RegExp(key, 'g'), value);
}

fs.writeFileSync(file, content);
