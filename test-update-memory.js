let payload = "string_uid";
let merged = { ...{}, ...payload };
console.log(merged);

let payload2 = true;
let merged2 = { ...{}, ...payload2 };
console.log(merged2);
