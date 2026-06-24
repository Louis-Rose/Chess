// Show which host was blocked (from the ?host= query the redirect rule adds).
const host = new URLSearchParams(location.search).get('host') || 'This site';
document.getElementById('host').textContent = host;
