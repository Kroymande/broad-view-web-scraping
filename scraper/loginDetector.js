async function isLoginScreen(page) {
    const hasPasswordField = await page.$('input[type="password"]');
    if (!hasPasswordField) return false;

    // Check for common login keywords in visible form buttons or labels
    const loginKeywords = ['login', 'log in', 'sign in'];
    
    const textContent = await page.evaluate(() => {
        return [...document.querySelectorAll('button, a, label, input[type="submit"]')]
            .map(el => el.innerText.toLowerCase() || el.value?.toLowerCase() || '')
            .filter(Boolean)
            .join(' ');
    });

    console.log('[LOGIN DETECTOR] Found password field:', !!hasPasswordField);
    console.log('[LOGIN DETECTOR] Page text content:', textContent);

    return loginKeywords.some(word => textContent.includes(word));
}

module.exports = isLoginScreen;