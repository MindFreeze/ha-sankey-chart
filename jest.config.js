module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'jest-environment-jsdom',
    setupFiles: [],
    // roots: [
    //     '<rootDir>',
    //     '<rootDir>/node_modules',
    // ],
    // moduleDirectories: [
    //     'src',
    //     'node_modules',
    // ],
    moduleNameMapper: {
        '^lit/(.*)$': ['<rootDir>/node_modules/lit/$1'],
    },
    transform: {"^.+\\.(js|ts)x?$": 'ts-jest'},
    transformIgnorePatterns: ['node_modules/(?!lit-element|lit-html|lit|@lit/)'],
};