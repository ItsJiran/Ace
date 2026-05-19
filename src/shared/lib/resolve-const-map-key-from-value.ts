/**
 * This function is the reverse of the original resolveConstMap. 
 * It takes a value and a constant map, then returns the corresponding key for that value.
 * 
 * For example: resolveConstMap('Admin', { 1: 'Admin', 2: 'User', 3: 'Guest' }) will return '1'
 */
export default <T extends Record<string | number, any>>(
    value: T[keyof T], 
    constMap: T
): keyof T | undefined => {
    return (Object.keys(constMap) as (keyof T)[]).find(key => constMap[key] === value);
};