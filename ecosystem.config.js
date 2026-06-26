const path = require('path');

module.exports = {
  apps: [
    {
      name:    'teja-market',
      script:  'src/app.js',
      cwd:     path.join(__dirname, 'backend'),
      watch:   false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
