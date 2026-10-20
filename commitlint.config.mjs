export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [2, 'always', [
      'script', 'python', 'cpp', 'shell', 'harbor', 'ds',
      'landing', 'shared', 'progress', 'engine', 'content', 'release',
      'tests', 'ci', 'deps', 'docs', 'tools', 'skills',
    ]],
    'subject-case': [0],
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
};
