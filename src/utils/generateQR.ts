import QRCode from 'qrcode';

async function generate() {
  const url = 'https://linktr.ee/ebnabdallah';
  const dataUrl = await QRCode.toDataURL(url, { errorCorrectionLevel: 'H', width: 100 });
  console.log(dataUrl);
}

generate();
