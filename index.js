module.exports = fotno => {
	[
		require('./src/command.format-manifests')
	].forEach(mod => mod(fotno));
};
