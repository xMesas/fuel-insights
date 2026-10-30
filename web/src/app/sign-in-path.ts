export function signInPath(value: string | null): string | null {
	if (!value?.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value))
		return null;
	return value;
}
