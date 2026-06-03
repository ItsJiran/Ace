# ACE Graph v1 — Workflow Hierarchy

## Parent Graph: `ace`

```mermaid
graph TD
    START((START)) --> supervision_edge{supervision_edge}
    supervision_edge -->|route| orchestrator[orchestrator]
    supervision_edge -->|route| executor[executor]
    supervision_edge -->|route| summarization[summarization]
    orchestrator -->|loop| supervision_edge
    executor -->|loop| supervision_edge
    summarization --> END((END))
```

## Subgraph: `orchestrator`

```mermaid
graph TD
    subgraph orchestrator
        O_START((START)) --> O_supervision{supervision_edge}
        O_supervision -->|route| thought_wrapper[thought<br/>→ thought subgraph]
        O_supervision -->|route| planner[planner]
        O_supervision -->|route| contextor_wrapper[contextor<br/>→ contextor subgraph]
        O_supervision -->|route| orchestrator_node[orchestrator]
        thought_wrapper -->|loop| O_supervision
        planner -->|loop| O_supervision
        contextor_wrapper -->|loop| O_supervision
        orchestrator_node -->|loop| O_supervision
        O_supervision -->|__end__| O_END((END))
    end
```

## Subgraph: `thought`

```mermaid
graph TD
    subgraph thought
        T_START((START)) --> T_supervision{supervision_edge}
        T_supervision -->|route| analyze[analyze]
        T_supervision -->|route| reflect[reflect]
        T_supervision -->|route| critique[critique]
        T_supervision -->|route| synthesize[synthesize]
        analyze -->|loop| T_supervision
        reflect -->|loop| T_supervision
        critique -->|loop| T_supervision
        synthesize -->|loop| T_supervision
        T_supervision -->|__end__| T_END((END))
    end
```

## Subgraph: `executor`

```mermaid
graph TD
    subgraph executor
        E_START((START)) --> E_supervision{supervision_edge}
        E_supervision -->|route| tool[tool]
        E_supervision -->|route| contextor_wrapper[contextor<br/>→ contextor subgraph]
        tool -->|loop| E_supervision
        contextor_wrapper -->|loop| E_supervision
        E_supervision -->|__end__| E_END((END))
    end
```

## Subgraph: `contextor`

```mermaid
graph TD
    subgraph contextor
        C_START((START)) --> C_supervision{supervision_edge}
        C_supervision -->|route| context_retriever[context_retriever]
        C_supervision -->|route| tool_retriever[tool_retriever]
        context_retriever -->|loop| C_supervision
        tool_retriever -->|loop| C_supervision
        C_supervision -->|__end__| C_END((END))
    end
```

## Full Cross-Graph Delegation

```mermaid
graph TD
    subgraph ace[ace parent graph]
        ACE_START((START)) --> ACE_sup{supervision_edge}
        ACE_sup -->|route| ace_orchestrator[orchestrator wrapper]
        ACE_sup -->|route| ace_executor[executor wrapper]
        ACE_sup -->|route| ace_summarization[summarization]
        ace_orchestrator -->|loop| ACE_sup
        ace_executor -->|loop| ACE_sup
        ace_summarization --> ACE_END((END))
    end

    subgraph orchestrator[orchestrator subgraph]
        O_sup{supervision_edge}
        O_thought[thought → thought subgraph]
        O_planner[planner]
        O_contextor[contextor → contextor subgraph]
        O_orch[orchestrator]
    end

    subgraph thought[thought subgraph]
        T_sup{supervision_edge}
        T_analyze[analyze]
        T_reflect[reflect]
        T_critique[critique]
        T_synthesize[synthesize]
    end

    subgraph executor[executor subgraph]
        E_sup{supervision_edge}
        E_tool[tool]
        E_contextor[contextor → contextor subgraph]
    end

    subgraph contextor[contextor subgraph]
        C_sup{supervision_edge}
        C_cretriever[context_retriever]
        C_tretriever[tool_retriever]
    end

    ace_orchestrator -.->|invoke| orchestrator
    ace_executor -.->|invoke| executor
    O_thought -.->|invoke| thought
    O_contextor -.->|invoke| contextor
    E_contextor -.->|invoke| contextor
```

## Node Reference

| Graph | Node | Type | Delegates to |
|-------|------|------|--------------|
| `ace` | `supervision_edge` | conditional edge | — |
| `ace` | `orchestrator` | wrapper node | `orchestrator` subgraph |
| `ace` | `executor` | wrapper node | `executor` subgraph |
| `ace` | `summarization` | LLM node | — |
| `orchestrator` | `supervision_edge` | conditional edge | — |
| `orchestrator` | `thought` | wrapper node | `thought` subgraph |
| `orchestrator` | `planner` | LLM node (structured output) | — |
| `orchestrator` | `contextor` | wrapper node | `contextor` subgraph |
| `orchestrator` | `orchestrator` | LLM node (structured output) | — |
| `thought` | `supervision_edge` | conditional edge | — |
| `thought` | `analyze` | LLM node | — |
| `thought` | `reflect` | LLM node | — |
| `thought` | `critique` | LLM node | — |
| `thought` | `synthesize` | LLM node | — |
| `executor` | `supervision_edge` | conditional edge | — |
| `executor` | `tool` | tool execution node | — |
| `executor` | `contextor` | wrapper node | `contextor` subgraph |
| `contextor` | `supervision_edge` | conditional edge | — |
| `contextor` | `context_retriever` | retrieval node | — |
| `contextor` | `tool_retriever` | retrieval node | — |
