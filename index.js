module.exports = app => {
	[
		require('./src/command.format-manifests')
	].forEach(mod => mod(app));
};
