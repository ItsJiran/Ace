import re

with open("src/main.tsx", "r") as f:
    text = f.read()

# Remove the scroll lag fix
pattern = r"// 🚀 GLOBAL SCROLL LAG FIX.*?\}\, \{ passive: true, capture: true \}\);\n\n"
text = re.sub(pattern, "", text, flags=re.DOTALL)

with open("src/main.tsx", "w") as f:
    f.write(text)

with open("src/index.css", "r") as f:
    css_text = f.read()

css_pattern = r"  \.disable-hover-during-scroll \* \{\n    pointer-events: none !important;\n  \}\n"
css_text = re.sub(css_pattern, "", css_text, flags=re.DOTALL)

with open("src/index.css", "w") as f:
    f.write(css_text)
