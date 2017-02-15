'use strict';
const path = require('path'),
	os = require('os'),
	fs = require('fs-extra'),
	glob = require('globby');

const OFFICIALLY_SUPPORTED_MANIFEST_PROPERTIES = [
	'dependencies',
	'devDependencies'
];

function transformManifest (propertyTransformers, code, manifestContent, includedProperties) {
	return includedProperties
		.reduce((manifestClean, property) => {
			if(!manifestContent[property])
				return manifestClean;

			let manifestValue = propertyTransformers[property]
					? propertyTransformers[property].reduce((cleanProperty, transformer) => transformer(code, cleanProperty), manifestContent[property])
					: manifestContent[property];

			if(typeof manifestValue === 'object' && !Object.keys(manifestValue).length)
				return manifestClean;

			manifestClean[property] = manifestValue;

			return manifestClean;
		}, {})
}
function reorderObjectProperties (code, content) {
	return Object.keys(content)
		.sort()
		.reduce((obj, key) => {
			obj[key] = content[key];
			return obj;
		}, {});
}

function rewriteLocations (code, content) {
	var allPackageLocations = glob.sync([
		'packages/*',
		'packages-shared/*',
		//'platform-linked/*', // no package should ever depend on platform-linked, becuase it is a FontoXML core dev tool
		'platform/*'
	], {
		cwd: code.path
	});

	Object.keys(content).forEach(packageName => {
		let activeSourceLocation = allPackageLocations.find(location => path.basename(location) === packageName);

		if(activeSourceLocation)
			content[packageName] = path.basename(path.resolve(activeSourceLocation, '..')) + '/' + packageName;
	});

	return content;
}


function formatManifestController (req, res) {
	res.caption(`fotno format-manifests`);

	res.debug('Looking for fonto-manifest.json files');

	const propertyTransformers = {
		dependencies: [],
		devDependencies: []
	};

	const code = req.scope[0],
		cwd = path.resolve(code.path, req.options.source),
		manifests = glob.sync(['**/fonto-manifest.json'], {
			cwd: cwd
		});

	res.debug(`Formatting ${manifests.length} manifest files in "${req.options.source}".`);

	if(!req.options['no-reorder']) {
		propertyTransformers.dependencies.push(reorderObjectProperties);
		propertyTransformers.devDependencies.push(reorderObjectProperties);
	} else {
		res.debug('Not reordering property names');
	}

	if(!req.options['no-dep-locations']) {
		propertyTransformers.dependencies.push(rewriteLocations);
		propertyTransformers.devDependencies.push(rewriteLocations);
	} else {
		res.debug('Not rewriting dependency locations');
	}

	req.options['no-clean'] && res.debug('Not cleaning up unsupported manifest properties');

	manifests.forEach(manifest => {
		const manifestPath = path.join(cwd, manifest);
		try {
			var manifestContent = require(manifestPath);
		} catch (e) {
			res.property('Skip', path.basename(path.dirname(manifestPath)), 7, 'error');
			res.error(e);
			return;
		}

		let includedProperties =
			req.options['no-clean']
				? Object.keys(manifestContent)
				: OFFICIALLY_SUPPORTED_MANIFEST_PROPERTIES;

		if(!req.options['no-reorder'])
			includedProperties = includedProperties.sort();

		fs.writeFileSync(manifestPath, JSON.stringify(transformManifest(
			propertyTransformers,
			code,
			manifestContent,
			includedProperties
		), null ,'\t') + os.EOL);

		res.property('Rewrote', path.basename(path.dirname(manifestPath)), 7);
	});

	res.success('Done');
}

module.exports = app => {
	app.cli.addCommand('format-manifests')
		.setDescription(`(Experimental) Does some basic formatting of manifest files.`)
		.setLongDescription([
			`Reorders your manifest properties and dependency names alphabetically.`,
			`Fixes missing or erronous package locations in manifest dependencies (eg. "packages/my-extension")`,
			`Indents everything with tabs instead of anything else`
		].join('\n\n'))
		.addOption(new app.cli.Option('source')
			.setDefault('packages', true)
			.setDescription('Source directory to look for packages containing a manifest. Defaults to "packages". Setting it to anything different is probably not a good idea.')
		)
		.addOption('no-clean', 'C', 'Do not clean manifest properties that are not used. If omitted all unofficial manifest properties will be stripped away. Let go of all that weight. You are not your semver info. You are not your fucking khakis. You are the all singing, all dancing crap of the world.')
		.addOption('no-reorder', 'R', 'Do not reorder manifest properties and dependencies alphabetically')
		.addOption('no-dep-locations', 'L', 'Do not rewrite the (dev) dependencies to point to their locations. You shouldn\'t not have to not use this flag.')
		.setController(formatManifestController);
};
