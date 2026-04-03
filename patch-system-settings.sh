#!/bin/bash
sed -i "s/import { List } from 'react-window';//" src/core/packages/system/components/SystemSettings.tsx
sed -i "s/import { RenderCounterBadge } from '#\/components\/dev\/RenderCounterBadge';/import { RenderCounterBadge } from '#\/components\/dev\/RenderCounterBadge';\nimport { SpatialVirtualizer } from '#\/components\/layout\/SpatialVirtualizer';/" src/core/packages/system/components/SystemSettings.tsx

awk '
/^[ \t]*<List/ {
    print "                <SpatialVirtualizer className=\"w-full h-[500px] overflow-auto\">"
    print "                    {keybinds.map((kb, index) => <Row index={index} key={kb.id || String(index)} />)}"
    print "                </SpatialVirtualizer>"
    in_list = 1
    next
}
in_list == 1 && /^[ \t]*\/>/ {
    in_list = 0
    next
}
in_list == 1 { next }
{ print }
' src/core/packages/system/components/SystemSettings.tsx > temp.tsx

mv temp.tsx src/core/packages/system/components/SystemSettings.tsx
