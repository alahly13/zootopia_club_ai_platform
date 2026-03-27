const fs = require('fs');
const file = 'src/auth/Login.tsx';
let content = fs.readFileSync(file, 'utf8');

const replacements = {
  'Student Registration 🎓': "{t('studentRegistration')}",
  'Step {regStep} of 3': "{t('step')} {regStep} {t('of')} 3",
  'Account Security': "{t('accountSecurity')}",
  'Personal Details': "{t('personalDetails')}",
  'Academic Information': "{t('academicInfo')}",
  'Username \\*': "{t('username')}",
  'Email Address \\*': "{t('email')}",
  'Password \\*': "{t('password')}",
  'Confirm Password \\*': "{t('confirmPassword')}",
  'Full Name \\*': "{t('fullName')}",
  'Country \\*': "{t('country')}",
  'Nationality \\*': "{t('nationality')}",
  'Phone Number': "{t('phoneNumber')}",
  'Date of Birth \\*': "{t('dateOfBirth')}",
  'University Code \\*': "{t('universityCode')}",
  'Department / Major': "{t('department')}",
  'Academic Level': "{t('academicLevel')}",
  'By completing registration, you agree to our Terms of Service and Privacy Policy. Your data is securely stored and used only for academic purposes within Zootopia Club.': "{t('terms')}",
  'Back': "{t('back')}",
  'Continue': "{t('continue')}",
  'Complete Registration': "{t('completeRegistration')}",
  'Sign In': "{t('signIn')}",
  'Create a new account': "{t('createAccount')}",
  'Forgot password\\?': "{t('forgotPassword')}",
  'Administrator Login': "{t('adminLogin')}",
  'Email or Username': "{t('emailOrUsername')}",
};

for (const [key, value] of Object.entries(replacements)) {
  const regex = new RegExp(`>\\s*${key}\\s*<`, 'g');
  content = content.replace(regex, `>${value}<`);
  
  // Also handle cases where it's not between tags, like in ternary operators
  if (key === 'Account Security' || key === 'Personal Details' || key === 'Academic Information' || key === 'Complete Registration' || key === 'Continue') {
    const stringRegex = new RegExp(`'${key}'`, 'g');
    content = content.replace(stringRegex, value);
  }
}

content = content.replace(/>Email or Username</g, ">{t('emailOrUsername')}<");
content = content.replace(/>Email Address</g, ">{t('email')}<");

fs.writeFileSync(file, content);
