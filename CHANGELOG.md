# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.4.1](https://github.com/Helmi/cacd/compare/v0.4.0...v0.4.1) (2026-03-01)


### Bug Fixes

* **sessions:** fix rehydrated sessions returning 404 on stop, restart, rename, and other operations after daemon restart — session lookups now search across all project managers ([bf8392b](https://github.com/Helmi/cacd/commit/bf8392bd39e5b8e6221883eebbba8d76f7a259bb))
* **sessions:** deduplicate sessions in the aggregated session list to prevent the same session appearing twice across managers
* **sessions:** fix Socket.IO subscribe, input, and resize handlers only finding sessions in the current project manager
* **ci:** resolve Windows CI failures in tests and fix bun lockfile instability ([dca40a1](https://github.com/Helmi/cacd/commit/dca40a140407b1e0c710f2d97b5cfe8823ecc931), [fcfd69b](https://github.com/Helmi/cacd/commit/fcfd69b5611f5e7b14e360d3ddf0ca6e85e9b8dd), [6815924](https://github.com/Helmi/cacd/commit/6815924b4f7f7f439c94d70cc0f741650c3e3e45))
