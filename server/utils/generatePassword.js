const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

function generatePassword(length = 10) {
  let password = '';
  for (let i = 0; i < length; i++) {
    password += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  }
  return password;
}

module.exports = { generatePassword };
