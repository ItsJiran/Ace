import { useState } from 'react';
import { Plus, Trash2, Server, Pencil, X, Check } from 'lucide-react';
import { useAceTheme } from '#/app-desktop/hooks/use-ace-theme';
import { DefaultConfigAI } from '#/shared/constants/config';
import type { InferConfigData } from '#/shared/schemas/config';

type AIConfigType = InferConfigData<typeof DefaultConfigAI>;
type ProviderDetail = AIConfigType['ai.providers'][string];

type ConfigFieldAIProps = {
	config: AIConfigType | undefined;
};

const MODEL_PROVIDER_TYPE_OPTIONS = ['openai', 'anthropic', 'google'] as const;

export function ConfigFieldAI({ config }: ConfigFieldAIProps) {
	const { targets } = useAceTheme();

	const [newProviderName, setNewProviderName] = useState('');
	const [newProviderType, setNewProviderType] = useState<string>('openai');
	const [newProviderGateway, setNewProviderGateway] = useState('');

	// Edit inline state
	const [editingProvider, setEditingProvider] = useState<string | null>(null);
	const [editType, setEditType] = useState('openai');
	const [editGateway, setEditGateway] = useState('');
	const [editApiKey, setEditApiKey] = useState('');
	const [editModels, setEditModels] = useState<string[]>([]);
	const [editNewModel, setEditNewModel] = useState('');

	const providers = config?.['ai.providers'];
	const defaultProvider = config?.['ai.default_provider'];
	const defaultModel = config?.['ai.default_model'];

	const providerNames = providers ? Object.keys(providers) : [];
	const currentProviderModels = defaultProvider && providers?.[defaultProvider]?.models
		? providers[defaultProvider].models
		: [];

	const handleAddProvider = async () => {
		const name = newProviderName.trim().toLowerCase();
		if (!name || !providers) return;

		const nextProviders = {
			...providers,
			[name]: {
				models: [],
				model_provider_type: newProviderType,
				gateway: newProviderGateway,
			},
		};

		await window.ACE.config.updateConfigItem('ai', 'ai.providers', nextProviders);
		setNewProviderName('');
		setNewProviderGateway('');
	};

	const handleRemoveProvider = async (providerName: string) => {
		if (!providers) return;
		const { [providerName]: _, ...rest } = providers as Record<string, ProviderDetail>;
		await window.ACE.config.updateConfigItem('ai', 'ai.providers', rest);

		if (defaultProvider === providerName) {
			const next = Object.keys(rest)[0];
			if (next) await window.ACE.config.updateConfigItem('ai', 'ai.default_provider', next);
		}
	};

	const handleSetDefaultProvider = async (provider: string) => {
		await window.ACE.config.updateConfigItem('ai', 'ai.default_provider', provider);
		const models = providers?.[provider]?.models;
		if (models && models.length > 0) {
			await window.ACE.config.updateConfigItem('ai', 'ai.default_model', models[0]);
		}
	};

	const handleSetDefaultModel = async (model: string) => {
		await window.ACE.config.updateConfigItem('ai', 'ai.default_model', model);
	};

	// ---- Edit inline handlers ----

	const startEditing = (name: string) => {
		const detail = providers?.[name];
		if (!detail) return;
		setEditingProvider(name);
		setEditType(detail.model_provider_type);
		setEditGateway(detail.gateway ?? '');
		setEditApiKey(detail.api_key ?? '');
		setEditModels([...detail.models]);
		setEditNewModel('');
	};

	const cancelEditing = () => {
		setEditingProvider(null);
	};

	const saveEditing = async () => {
		if (!editingProvider || !providers) return;
		const nextProviders = {
			...providers,
			[editingProvider]: {
				models: editModels,
				model_provider_type: editType,
				gateway: editGateway,
				api_key: editApiKey,
			},
		};
		await window.ACE.config.updateConfigItem('ai', 'ai.providers', nextProviders);
		setEditingProvider(null);
	};

	const addEditModel = () => {
		const trimmed = editNewModel.trim();
		if (!trimmed || editModels.includes(trimmed)) return;
		setEditModels([...editModels, trimmed]);
		setEditNewModel('');
	};

	const removeEditModel = (model: string) => {
		setEditModels(editModels.filter((m) => m !== model));
	};

	return (
		<div className="flex flex-col gap-4">
			{/* Default Provider & Model */}
			<section className={[targets.shell.first, 'rounded-2xl p-4 flex flex-col gap-4 border-none'].join(' ')}>
				<div className="flex items-start gap-3">
					<div className={[targets.btn.secondary, 'rounded-2xl p-3'].join(' ')}>
						<Server size={18} />
					</div>
					<div>
						<div className="text-lg font-semibold">Active Provider & Model</div>
						<div className="mt-1 text-sm leading-6">
							Select the default provider and model for AI interactions.
						</div>
					</div>
				</div>

				<div className="grid gap-3">
					{/* Default Provider */}
					<label className={[targets.container.third, 'flex flex-col gap-2 rounded-2xl px-4 py-3'].join(' ')}>
						<div className="text-sm font-medium text-zinc-100">Default Provider</div>
						<select
							value={String(defaultProvider ?? '')}
							onChange={(e) => { void handleSetDefaultProvider(e.target.value); }}
							className={[targets.input.first, 'rounded-xl px-3 py-2 text-sm text-zinc-100'].join(' ')}
						>
							{providerNames.map((name) => (
								<option key={name} value={name}>{name}</option>
							))}
						</select>
					</label>

					{/* Default Model */}
					<label className={[targets.container.third, 'flex flex-col gap-2 rounded-2xl px-4 py-3'].join(' ')}>
						<div className="text-sm font-medium text-zinc-100">Default Model</div>
						<select
							value={String(defaultModel ?? '')}
							onChange={(e) => { void handleSetDefaultModel(e.target.value); }}
							className={[targets.input.first, 'rounded-xl px-3 py-2 text-sm text-zinc-100'].join(' ')}
						>
							{currentProviderModels.map((model: string) => (
								<option key={model} value={model}>{model}</option>
							))}
						</select>
					</label>
				</div>
			</section>

			{/* Provider List */}
			<section className={[targets.shell.first, 'rounded-2xl p-4 flex flex-col gap-4 border-none'].join(' ')}>
				<div>
					<div className="text-lg font-semibold">Providers</div>
					<div className="mt-1 text-sm leading-6">
						Manage your AI providers, their models, and gateway URLs.
					</div>
				</div>

				<div className="grid gap-3">
					{providerNames.map((name) => {
						const detail = providers?.[name];
						const isDefault = name === defaultProvider;
						const isEditing = editingProvider === name;
						return (
							<div
								key={name}
								className={[targets.container.third, 'rounded-2xl px-4 py-3 flex flex-col gap-2'].join(' ')}
							>
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2">
										<span className="text-sm font-semibold text-zinc-100 capitalize">{name}</span>
										{isDefault && (
											<span className="text-[10px] font-bold uppercase tracking-[0.12em] rounded-full bg-white/15 px-2 py-0.5 text-zinc-200">
												default
											</span>
										)}
									</div>
									<div className="flex items-center gap-1">
										<button
											type="button"
											onClick={() => { isEditing ? cancelEditing() : startEditing(name); }}
											className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-zinc-200 transition-colors"
											title={isEditing ? 'Cancel edit' : 'Edit provider'}
										>
											{isEditing ? <X size={14} /> : <Pencil size={14} />}
										</button>
										<button
											type="button"
											onClick={() => { void handleRemoveProvider(name); }}
											className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-red-400 transition-colors"
											title="Remove provider"
										>
											<Trash2 size={14} />
										</button>
									</div>
								</div>

								{isEditing ? (
									/* ---- Inline Edit Form ---- */
									<div className="flex flex-col gap-2 mt-1">
										<div className="flex gap-2">
											<select
												value={editType}
												onChange={(e) => setEditType(e.target.value)}
												className={[targets.input.first, 'flex-1 rounded-xl px-3 py-1.5 text-xs text-zinc-100'].join(' ')}
											>
												{MODEL_PROVIDER_TYPE_OPTIONS.map((opt) => (
													<option key={opt} value={opt}>{opt}</option>
												))}
											</select>
											<input
												type="text"
												placeholder="Gateway URL"
												value={editGateway}
												onChange={(e) => setEditGateway(e.target.value)}
												className={[targets.input.first, 'flex-[2] rounded-xl px-3 py-1.5 text-xs text-zinc-100'].join(' ')}
											/>
										</div>
										<input
											type="password"
											placeholder="API Key (leave empty for system keyring)"
											value={editApiKey}
											onChange={(e) => setEditApiKey(e.target.value)}
											className={[targets.input.first, 'rounded-xl px-3 py-1.5 text-xs text-zinc-100'].join(' ')}
										/>

										{/* Models */}
										<div className="flex flex-col gap-1.5">
											<div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Models</div>
											<div className="flex flex-wrap gap-1.5">
												{editModels.map((model) => (
													<span
														key={model}
														className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-0.5 text-xs text-zinc-200"
													>
														{model}
														<button
															type="button"
															onClick={() => removeEditModel(model)}
															className="text-zinc-500 hover:text-red-400"
														>
															<X size={10} />
														</button>
													</span>
												))}
												{editModels.length === 0 && (
													<span className="text-xs text-zinc-500 italic">No models added</span>
												)}
											</div>
											<div className="flex gap-2 mt-1">
												<input
													type="text"
													placeholder="Add model name..."
													value={editNewModel}
													onChange={(e) => setEditNewModel(e.target.value)}
													onKeyDown={(e) => { if (e.key === 'Enter') addEditModel(); }}
													className={[targets.input.first, 'flex-1 rounded-xl px-3 py-1.5 text-xs text-zinc-100'].join(' ')}
												/>
												<button
													type="button"
													onClick={addEditModel}
													disabled={!editNewModel.trim()}
													className={[
														targets.btn.secondary,
														'rounded-xl px-3 py-1.5 text-xs font-semibold',
														!editNewModel.trim() ? 'opacity-40 cursor-not-allowed' : '',
													].join(' ')}
												>
													<Plus size={12} />
												</button>
											</div>
										</div>

										<button
											type="button"
											onClick={() => { void saveEditing(); }}
											className={[targets.btn.secondary, 'rounded-xl px-4 py-2 text-sm font-semibold flex items-center justify-center gap-2 mt-1'].join(' ')}
										>
											<Check size={14} />
											Save Changes
										</button>
									</div>
								) : (
									/* ---- Read-only detail ---- */
									<div className="flex flex-col gap-1.5">
										<div className="text-xs text-zinc-400 flex flex-wrap gap-x-3 gap-y-1">
											<span>Type: {detail?.model_provider_type}</span>
											{detail?.gateway && <span>Gateway: {detail.gateway}</span>}
											<span>{detail?.api_key ? '🔑 Key set' : 'No API key'}</span>
										</div>
										<div className="flex flex-wrap gap-1">
											{(detail?.models ?? []).map((model: string) => (
												<span
													key={model}
													className="inline-flex rounded-lg bg-white/8 px-2 py-0.5 text-[11px] text-zinc-300"
												>
													{model}
												</span>
											))}
											{(detail?.models?.length ?? 0) === 0 && (
												<span className="text-[11px] text-zinc-500 italic">No models</span>
											)}
										</div>
									</div>
								)}
							</div>
						);
					})}
				</div>

				{/* Add Provider Form */}
				<div className={[targets.container.third, 'rounded-2xl px-4 py-3 flex flex-col gap-3'].join(' ')}>
					<div className="text-sm font-medium text-zinc-100">Add Provider</div>
					<div className="grid gap-2">
						<input
							type="text"
							placeholder="Provider name (e.g. openrouter)"
							value={newProviderName}
							onChange={(e) => setNewProviderName(e.target.value)}
							className={[targets.input.first, 'rounded-xl px-3 py-2 text-sm text-zinc-100'].join(' ')}
						/>
						<div className="flex gap-2">
							<select
								value={newProviderType}
								onChange={(e) => setNewProviderType(e.target.value)}
								className={[targets.input.first, 'flex-1 rounded-xl px-3 py-2 text-sm text-zinc-100'].join(' ')}
							>
								{MODEL_PROVIDER_TYPE_OPTIONS.map((opt) => (
									<option key={opt} value={opt}>{opt}</option>
								))}
							</select>
							<input
								type="text"
								placeholder="Gateway URL (optional)"
								value={newProviderGateway}
								onChange={(e) => setNewProviderGateway(e.target.value)}
								className={[targets.input.first, 'flex-[2] rounded-xl px-3 py-2 text-sm text-zinc-100'].join(' ')}
							/>
						</div>
						<button
							type="button"
							onClick={() => { void handleAddProvider(); }}
							disabled={!newProviderName.trim()}
							className={[
								targets.btn.secondary,
								'rounded-xl px-4 py-2 text-sm font-semibold flex items-center justify-center gap-2',
								!newProviderName.trim() ? 'opacity-40 cursor-not-allowed' : '',
							].join(' ')}
						>
							<Plus size={14} />
							Add Provider
						</button>
					</div>
				</div>
			</section>
		</div>
	);
}
