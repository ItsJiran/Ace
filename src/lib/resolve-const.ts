/**
 * This function takes a constant map and a key, and returns the corresponding value for that key.
 * For example, if we have a constant map for user roles like Keybinds 'CHORAL_A' = 'CHORAL_A'.
 * if we pass the key 'CHORAL_A' to this function, it will return the value 'CHORAL_A'.
 */
export default <T extends Record<string | number, any>>(
    value: string | number, 
    constMap: T
): T[keyof T] | undefined => {
    let found =  Object.prototype.hasOwnProperty.call(constMap, value);
    if(found && constMap[value] === value) {
        return constMap[value];
    } else {
        return undefined;
    }
};