// Markdown files are bundled as plain text (angular.json, "loader": { ".md": "text" }).
declare module '*.md' {
	const text: string;
	export default text;
}
