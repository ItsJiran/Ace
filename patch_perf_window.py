import re

with open("src/core/packages/system-dev/windows/PerformanceDebugWindow.tsx", "r") as f:
    text = f.read()

# Replace useAceMemory with a throttled local state
search_pattern = r"    const ramLogs = useAceMemory<any\[\]>\('system:perf_observer:ram'\) \|\| \[\];"

replace_pattern = """    const _rawRamLogs = useAceMemory<any[]>('system:perf_observer:ram') || [];
    const [ramLogs, setRamLogs] = useState<any[]>([]);

    useEffect(() => {
        const t = setTimeout(() => {
            setRamLogs(_rawRamLogs);
        }, 150); // ONLY update DOM logs 6 times a second to prevent absolute layout thrashing!
        return () => clearTimeout(t);
    }, [_rawRamLogs]);"""

text = text.replace(search_pattern, replace_pattern)

with open("src/core/packages/system-dev/windows/PerformanceDebugWindow.tsx", "w") as f:
    f.write(text)

