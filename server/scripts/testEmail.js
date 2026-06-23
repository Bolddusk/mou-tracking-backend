require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const { sendMail, isEmailEnabled, getFromAddress } = require('../utils/mailer');

const testTo = process.argv[2] || process.env.EMAIL_USER;

async function main() {
  console.log('Email enabled:', isEmailEnabled());
  console.log('SMTP host:', process.env.EMAIL_HOST);
  console.log('SMTP port:', process.env.EMAIL_PORT);
  console.log('From:', getFromAddress());
  console.log('To:', testTo);

  if (!isEmailEnabled()) {
    console.error('Email is not enabled. Check EMAIL_* in .env');
    process.exit(1);
  }

  const info = await sendMail(
    testTo,
    'AVRIO — Investment Portal email test',
    `<p>If you received this, SMTP is working.</p><p>Sent at ${new Date().toISOString()}</p>`
  );

  console.log('SUCCESS');
  console.log('Message ID:', info.messageId);
  console.log('Response:', info.response);
  process.exit(0);
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  if (err.code) console.error('Code:', err.code);
  if (err.response) console.error('SMTP response:', err.response);
  process.exit(1);
});
