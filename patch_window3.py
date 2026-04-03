import re

with open("src/hooks/useAceWindow.ts", "r") as f:
    text = f.read()

# REMOVE localX and localY definitions and effects
pattern = r"    const \[localX, setLocalX\] = useState<number \| null>\(null\);\n    const \[localY, setLocalY\] = useState<number \| null>\(null\);\n.*?useLayoutEffect\(\(\) => \{\n        if \(\!elementRef\.current\) return;\n        \n        const x = localX \?\? 0;\n        const y = localY \?\? 0;\n        elementRef\.current\.style\.transform = `translate\(\$\{x\}px, \$\{y\}px\)`;\n    \}, \[localX, localY\]\);\n"
text = re.sub(pattern, "", text, flags=re.DOTALL)

with open("src/hooks/useAceWindow.ts", "w") as f:
    f.write(text)
