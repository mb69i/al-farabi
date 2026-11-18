// Must be imported BEFORE @sparticuz/chromium (it reads these variables when it loads).
// Vercel's Node 22 functions run on Amazon Linux 2023, but may not say so in AWS_EXECUTION_ENV; without
// this hint the package can unpack the older Amazon Linux 2 libraries and Chromium fails to start.
if (process.env.VERCEL && !process.env.AWS_LAMBDA_JS_RUNTIME && !process.env.AWS_EXECUTION_ENV) {
  process.env.AWS_LAMBDA_JS_RUNTIME = 'nodejs22.x';
}
