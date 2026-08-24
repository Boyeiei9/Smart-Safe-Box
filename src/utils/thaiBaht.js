/**
 * Utility to convert numeric currency values into Thai Baht text format.
 * Example: 15500 -> "หนึ่งหมื่นห้าพันห้าร้อยบาทถ้วน"
 */

export function arabicToThaiBaht(number) {
  if (number === null || number === undefined || isNaN(number)) {
    return 'ศูนย์บาทถ้วน';
  }

  const num = Number(number);
  if (num === 0) {
    return 'ศูนย์บาทถ้วน';
  }

  // Round to 2 decimals
  const rounded = Math.abs(num).toFixed(2);
  const [bahtStr, satangStr] = rounded.split('.');

  const thaiNumbers = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  const thaiUnits = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];

  function convertGroup(digitsStr) {
    let result = '';
    const len = digitsStr.length;

    for (let i = 0; i < len; i++) {
      const digit = parseInt(digitsStr[i], 10);
      const pos = len - 1 - i;

      if (digit !== 0) {
        if (pos === 1 && digit === 1) {
          result += 'สิบ';
        } else if (pos === 1 && digit === 2) {
          result += 'ยี่สิบ';
        } else if (pos === 0 && digit === 1 && len > 1 && digitsStr[len - 2] !== '0') {
          result += 'เอ็ด';
        } else {
          result += thaiNumbers[digit] + thaiUnits[pos];
        }
      }
    }
    return result;
  }

  function convertBaht(digitsStr) {
    if (digitsStr === '0' || !digitsStr) return '';
    
    let result = '';
    let str = digitsStr;

    // Handle millions (> 6 digits)
    while (str.length > 6) {
      const group = str.slice(-6);
      str = str.slice(0, -6);
      result = 'ล้าน' + convertGroup(group) + result;
    }

    result = convertGroup(str) + result;
    return result;
  }

  const bahtText = convertBaht(bahtStr);
  const satangVal = parseInt(satangStr, 10);

  let finalResult = (num < 0 ? 'ลบ' : '');

  if (bahtText) {
    finalResult += bahtText + 'บาท';
  } else {
    finalResult += 'ศูนย์บาท';
  }

  if (satangVal === 0) {
    finalResult += 'ถ้วน';
  } else {
    finalResult += convertGroup(satangStr) + 'สตางค์';
  }

  return finalResult;
}
