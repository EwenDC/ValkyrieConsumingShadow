import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const sourceDirectory = "../ConsumingShadowSource/";
const baseLanguage = "English";
const localizationFiles = /^Localization\.(\w+)\.txt$/;
const untranslatedKeys = /^EventStart.button[2-9]$|^EventTest_/;
const droppedValues = /^Button\d$/;

const componentRef = /{c:\w+}/g;
function stripComponentRefs(value) {
  let index = 0;
  return value.replaceAll(componentRef, () => {
    const placeholder = `[${index}]`;
    index++;
    return placeholder;
  });
}
function insertComponentRefs(strippedValue, baseValue) {
  const refs = baseValue.match(componentRef) ?? [];
  let value = strippedValue;
  for (let index = 0; index < refs.length; index++) {
    value = value.replace(`[${index}]`, refs[index]);
  }
  if (/\[\d+\]/.test(value)) {
    console.debug({ baseValue, strippedValue, value });
    throw new Error("Failed to insert all component refs!");
  }
  return value;
}

function writeStringsToFile(path, strings, endOfLine = "\n") {
  const output = strings
    .entries()
    .toArray()
    .map((entry) => entry.join())
    .sort(new Intl.Collator("en").compare)
    .join(endOfLine);

  writeFileSync(path, output, "utf8");
}

const sourceFiles = readdirSync(sourceDirectory);
const languages = sourceFiles.reduce((map, file) => {
  const fileMatch = file.match(localizationFiles);
  if (fileMatch) {
    const language = fileMatch[1];
    const filePath = `${sourceDirectory}${file}`;
    const fileContents = readFileSync(filePath, "utf8");

    const strings = new Map();
    const endOfLine = fileContents.includes("\r\n") ? "\r\n" : "\n";
    for (const line of fileContents.split(endOfLine)) {
      if (line) {
        const [key, ...value] = line.split(",");
        const joinedValue = value.join();
        if (!droppedValues.test(joinedValue)) strings.set(key, joinedValue);
      }
    }
    map.set(language, {
      filePath,
      strings,
      endOfLine,
    });
  }
  return map;
}, new Map());

const baseStrings = languages.get(baseLanguage)?.strings;
if (!baseStrings) throw new Error("Missing base language!");

for (const [
  language,
  { filePath, strings, endOfLine },
] of languages.entries()) {
  if (language !== baseLanguage) {
    const baseMapping = new Map();
    const missingKeys = new Set();
    const missingStrings = new Map();

    for (const [baseKey, baseValue] of baseStrings.entries()) {
      if (untranslatedKeys.test(baseKey)) {
        strings.set(baseKey, baseValue);
      } else if (strings.has(baseKey)) {
        baseMapping.set(
          stripComponentRefs(baseValue),
          stripComponentRefs(strings.get(baseKey))
        );
      } else {
        missingKeys.add(baseKey);
      }
    }

    for (const key of missingKeys.values()) {
      const baseValue = baseStrings.get(key);
      const strippedBaseValue = stripComponentRefs(baseValue);
      if (baseMapping.has(strippedBaseValue)) {
        const strippedValue = baseMapping.get(strippedBaseValue);
        const value = insertComponentRefs(strippedValue, baseValue);
        strings.set(key, value);
      } else {
        missingStrings.set(key, baseValue);
      }
    }

    if (missingStrings.size > 0) {
      writeStringsToFile(`NewLocalization.${language}.txt`, missingStrings);
    }
  }

  writeStringsToFile(filePath, strings, endOfLine);
}
