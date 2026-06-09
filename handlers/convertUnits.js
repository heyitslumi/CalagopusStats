function formatBinaryBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const val = parseFloat((bytes / Math.pow(k, i)).toFixed(2));
    return `${val} ${sizes[i]}`;
}

module.exports = function convertUnits(value, max, unit) {
    unit = unit.toUpperCase();
    switch (unit) {
        case 'PERCENTAGE':
        case 'PERCENT':
            const percentage = Math.floor((value / max) * 100);
            return `${!percentage ? 0 : percentage}%`;
        case 'BYTE':
            const usedStr = formatBinaryBytes(value * 1024 * 1024);
            const maxStr = max === 0 ? "Unlimited" : formatBinaryBytes(max * 1024 * 1024);
            return `${usedStr} / ${maxStr}`;
        default:
            return `${value.toLocaleString()} ${unit}/${max === 0 ? "Unlimited" : `${max.toLocaleString()} ${unit}`}`;
    }
}