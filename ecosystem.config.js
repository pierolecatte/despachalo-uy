module.exports = {
    apps: [
        {
            name: "despachalo-uy-dev",
            script: "./node_modules/next/dist/bin/next",
            args: "dev",
            cwd: "./",
            watch: false,
            env: {
                NODE_ENV: "development",
            },
        },
    ],
};
