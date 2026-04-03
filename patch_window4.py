import re

with open("src/hooks/useAceWindow.ts", "r") as f:
    text = f.read()

# Fix beginDrag usages
text = text.replace("const initialX = localX ?? config.x;", """const initialX = elementRef.current ? parseFloat(elementRef.current.style.transform.split('(')[1].split('px')[0]) : config.x;""")
text = text.replace("const initialY = localY ?? config.y;", """const initialY = elementRef.current ? parseFloat(elementRef.current.style.transform.split(', ')[1].split('px')[0]) : config.y;""")

text = text.replace("[canCapturePointer, config, focus, localX, localY]", "[canCapturePointer, config, focus]")

# Strip width/height from rootStyle to use direct style from Kernel tracking!
pattern2 = r"            width: config\.width,\n            height: config\.height,\n"
text = re.sub(pattern2, "", text)

with open("src/hooks/useAceWindow.ts", "w") as f:
    f.write(text)
