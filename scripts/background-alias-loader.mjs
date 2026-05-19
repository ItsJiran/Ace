import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const loaderFile = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(loaderFile), '..');
const sourceRoot = path.join(projectRoot, 'src');

function resolveHashAlias(specifier) {
	const requestPath = specifier.slice(2);
	const absoluteBasePath = path.resolve(sourceRoot, requestPath);
	const candidates = [
		`${absoluteBasePath}.ts`,
		`${absoluteBasePath}.tsx`,
		`${absoluteBasePath}.js`,
		`${absoluteBasePath}.jsx`,
		`${absoluteBasePath}.mjs`,
		`${absoluteBasePath}.cjs`,
		`${absoluteBasePath}.json`,
		absoluteBasePath,
		path.join(absoluteBasePath, 'index.ts'),
		path.join(absoluteBasePath, 'index.tsx'),
		path.join(absoluteBasePath, 'index.js'),
		path.join(absoluteBasePath, 'index.mjs'),
	];

	for (const candidate of candidates) {
		if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
			return pathToFileURL(candidate).href;
		}
	}

	return pathToFileURL(absoluteBasePath).href;
}

export async function resolve(specifier, context, nextResolve) {
	if (specifier.startsWith('#/')) {
		return nextResolve(resolveHashAlias(specifier), context);
	}

	return nextResolve(specifier, context);
}