export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Optional scope, but if present it must be one of these.
    'scope-enum': [2, 'always', [
      'script', 'python', 'cpp', 'shell', 'harbor',
      'landing', 'shared', 'progress', 'engine', 'content',
      'tests', 'ci', 'deps', 'docs', 'tools', 'skills',
    ]],
    'subject-case': [0],
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
};
