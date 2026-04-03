import re

with open("src/index.css", "r") as f:
    text = f.read()

# Add pointer-events none
text = text.replace("@layer utilities {", "@layer utilities {\n  .disable-hover-during-scroll * {\n    pointer-events: none !important;\n  }\n")

with open("src/index.css", "w") as f:
    f.write(text)
