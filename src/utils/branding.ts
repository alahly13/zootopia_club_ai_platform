export const PLATFORM_NAME = "ZOOTOPIA CLUB";
export const PLATFORM_TAGLINE = "THE ULTIMATE AI SCIENCE PLATFORM";
export const WHATSAPP_NUMBER = "+201124511183";

export const BRANDING_COLORS = {
  primary: [16, 185, 129], // Emerald 500
  secondary: [5, 150, 105], // Emerald 600
  text: [31, 41, 55], // Gray 800
  muted: [107, 114, 128], // Gray 500
};

export const QR_CODE_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAAklEQVR4AewaftIAAATWSURBVO3BS2osOQAAwcyi73/lHGshMIKy++PhaaEI+8KxjYtjKxfHVi6OrVwcW7k4tnJxbOXi2MrFsZWLYysPnqTyqYqVylQxqEwV71BZVaxUhopJZaiYVD5V8ZuLYysXx1YevKHiFSp3KlYVd1RWFauKlcqnKl6h8oqLYysPPqByp+InKquKQWWq+K5iUlmp3KkYVFYqr1K5U/GOi2MrF8dWHmxEZahYqQwVU8WgsqqYVAaVVcWgsoOLYysP/pGKOyp3VN5VMaj8pOJfuTi28uADFZ9SeVfFSuU3FauKSWWo+EnFX7s4tnJxbOXBG1Q+pTJUTCpDxaQyVAwqK5WpYlCZKgaVoWJSGSqeofJ/uji2Yl/YhMpQsVK5UzGp3Km4ozJV/CsXx1Yujq08+CMq31VMKquKV1QMKlPFoDJVDCpTxStUhopnqKwq3nFxbMW+8CKVoWKlsqpYqawq7qgMFSuVV1RMKquKQWWqGFTuVHzq4tjKxbGVB/+TikllqJgq7qhMFUPFSuUZFd+pTBWDyqQyVPyk4o7KquI3F8dW7AsvUllVDCqrimeorCq+U1lV/CWVV1QMKlPFOy6OrVwcW3nwhorfVEwqz6hYqdypGFSmikFlVTGoPKNiUrmjMlR86uLYyoMnqawqJpU7FSuVoWKlsqpYqaxUhopJ5VMVd1RWKkPFKy6OrTx4UsVKZVWxUhkq/lLFoDJVDCp3Kn6islK5UzGoTBXvuDi2cnFsxb7wBJWpYlB5RsWgMlW8QmVVsVIZKiaVoeKOyqriGSrPqPjNxbGVB29QeYXKULFS+UnFdxUrlaliUHlXxaDyiopJZah4xcWxlYtjK/aFP6AyVNxR+UnFoPKMipXKqmJQGSomlaFiUhkqJpXfVKxUporfXBxbsS+8SGWoWKkMFZPKqmKlsqq4ozJUPENlVTGoTBV3VKaKQWVVMahMFb+5OLZycWzFvvAElZ9UvEJlVTGovKJipbKqWKk8o+KOyjMqfnNxbOXBkyomlVeo3KlYVUwqQ8VKZVB5V8UzVFYV31WsVF5xcWzlwZNUpopBZaWyqliprFSGildUvEtlqJhUhoqfqAwVdypecXFs5eLYyoMPVDxD5RkVg8pU8RuVn1QMKquKQWWqeIfKVDGoTBW/uTi28uCPqAwV71JZqXxXsar4icp3FT9RGSqmikFlqrijMlS84uLYysWxlQdvULmjMlRMKkPFSmWqWKncqVip/BWVn6h8V7FSmSp+c3Fsxb7wD6gMFZPKUDGpDBWDylTxDJWhYlCZKlYqQ8VPVH5T8YqLYysXx1YePEnlUxXPUJkqXqFyR2WoWKn8RGWoeEbFOy6OrTx4Q8UrVFYVq4pBZVL5rmKlMlX8RuVVFa9QGSpecXFs5eLYyoMPqNyp+InKquJOxUplpTJUfErlFRWTyjsujq082FDFSuUZFe+omFRWFYPKVDGoDCqfuji28uAfqRhUfqIyVAwqU8VK5TcVk8qgsqpYVUwqQ8WgslKZKn5zcWzl4tjKgw9UfKpipbJSuaMyVdxRGVSmikFlqlipDBVTxaDyVy6OrTx4g8pfUVlVTCrfVUwqQ8VKZV0qq4qVylDxVy6OrVwcW7EvHNu4OLZycWzl4tjKxbGVi2MrF8dWLo6tXBxb+Q9Oq87wZykWgwAAAABJRU5ErkJggg==";

export const drawBrandingSeal = (doc: any, x: number, y: number, size: number) => {
  doc.setDrawColor(...BRANDING_COLORS.primary);
  doc.setLineWidth(1);
  doc.circle(x, y, size, 'S');
  doc.setFontSize(size / 3);
  doc.setTextColor(...BRANDING_COLORS.primary);
  doc.text("VERIFIED", x, y, { align: 'center' });
};

export const drawQRCode = (doc: any, x: number, y: number, size: number) => {
  doc.addImage(QR_CODE_DATA_URL, 'PNG', x, y, size, size);
};
