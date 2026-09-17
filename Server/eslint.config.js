const js = require('@eslint/js');

module.exports = [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                require: 'readonly',
                module: 'readonly',
                exports: 'readonly',
                process: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                console: 'readonly',
                Buffer: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                Promise: 'readonly',
                URL: 'readonly',
                fetch: 'readonly'
            }
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_|next|req|res', caughtErrorsIgnorePattern: '^_' }],
            'no-console': 'off',
            'no-empty': ['warn', { allowEmptyCatch: true }],
            'no-constant-condition': ['warn', { checkLoops: false }]
        },
        ignores: ['node_modules/**', 'uploads/**', 'data/**']
    }
];
