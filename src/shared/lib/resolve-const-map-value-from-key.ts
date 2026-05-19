/**
 * This function takes a constant map and a key, and returns the corresponding value for that key.
 * 
 * For example, if we have a constant map for user roles like { 1: 'Admin', 2: 'User', 3: 'Guest' }, 
 * passing the key '1' will return the value 'Admin'.
 */
export default <T extends Record<string | number, any>>(
    key: string | number, 
    constMap: T
): T[keyof T] | undefined => {
    return Object.prototype.hasOwnProperty.call(constMap, key) 
        ? constMap[key] 
        : undefined;
};