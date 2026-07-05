<section class="about-page">
	<aside class="about-visual">
		<img src="/dialog_network.png" alt="A network of connected dialogues" />
	</aside>

	<article class="about-content">
		<header>
			<h1>About Quappe</h1>
			<p class="lead">
				Quappe is an argumentation platform. Theses, arguments, evidence — no comment wars,
				no flame trails, no anonymous insults masked as opinion.
			</p>
		</header>

		<section class="about-section">
			<h2>Purpose</h2>
			<p>
				Language is imprecise, opinions are everywhere — but commonality is hard to find. Social
				media has built bubbles, fronts and hate. Quappe is a different attempt: a structured
				space where positions can be stated clearly, supported with reasoning, challenged with
				rigour, and respected even where they differ.
			</p>
			<p>
				We search for <strong>shared ground</strong>. Where we disagree, we disagree with respect.
				Opinion without argumentation simply weighs less in the discourse — that is the design.
			</p>
		</section>

		<section class="about-section">
			<h2>How it works</h2>
			<ul class="how-list">
				<li><strong>Theses</strong> are the central entity — a claim someone proposes.</li>
				<li><strong>Arguments</strong> support or reject a thesis. They can carry evidence.</li>
				<li><strong>Fork instead of reply.</strong> Disagree with an argument? Copy it, adapt it, and let the crowd vote.</li>
				<li><strong>Votes</strong> are free. Creating costs a small daily budget — to encourage thoughtfulness.</li>
				<li><strong>Complexity slider</strong> controls how much you see at once.</li>
				<li><strong>Updates feed (<a href="/my/updates">/my/updates</a>)</strong> — see who forks your arguments, who reacts to your theses. Adjust your position when it matters.</li>
			</ul>
		</section>

		<section class="about-section">
			<h2>Lifecycle of a thesis</h2>
			<p>
				A thesis is never static. It goes through phases — driven by real activity, not by
				anyone's opinion of it. The state you see on each card tells you where a thesis
				stands in the discourse right now.
			</p>

			<div class="lifecycle-flow">
				<span class="lc-node lc-seedling">seedling</span>
				<span class="lc-arrow">→</span>
				<span class="lc-node lc-discussed">discussed</span>
				<span class="lc-arrow">→</span>
				<span class="lc-node lc-contested">contested</span>
				<span class="lc-arrow">→</span>
				<span class="lc-node lc-crystallized">crystallized</span>
				<span class="lc-arrow lc-arrow-fade">⤳</span>
				<span class="lc-node lc-faded">faded</span>
				<span class="lc-arrow lc-arrow-fade">⤳</span>
				<span class="lc-node lc-dormant">dormant</span>
			</div>

			<dl class="lc-states">
				<div class="lc-state">
					<dt><span class="lc-dot lc-seedling"></span> seedling</dt>
					<dd>Fresh out of the ground. Fewer than 7 days old, gathering first reactions.</dd>
				</div>
				<div class="lc-state">
					<dt><span class="lc-dot lc-discussed"></span> discussed</dt>
					<dd>Healthy activity. People are engaging, but no clear direction yet.</dd>
				</div>
				<div class="lc-state">
					<dt><span class="lc-dot lc-contested"></span> contested</dt>
					<dd>Active but polarised — support and reject are roughly balanced. The hard, interesting cases live here.</dd>
				</div>
				<div class="lc-state">
					<dt><span class="lc-dot lc-crystallized"></span> crystallized</dt>
					<dd>A clear majority (≥ 65 %) backed by solid arguments. Something the community has worked through.</dd>
				</div>
				<div class="lc-state">
					<dt><span class="lc-dot lc-faded"></span> faded</dt>
					<dd>Activity dropped without reaching consensus. Not deleted — still reachable, just quiet.</dd>
				</div>
				<div class="lc-state">
					<dt><span class="lc-dot lc-dormant"></span> dormant</dt>
					<dd>Untouched for 90+ days. Kept as a cold reference; can wake up when new activity arrives.</dd>
				</div>
			</dl>

			<p class="lc-note">
				This is intentional. The platform is designed to <strong>let noise fade</strong> and
				<strong>surface what crystallises</strong> — not everything deserves the same
				attention forever.
			</p>
		</section>

		<section class="about-section rules">
			<h2>Rules</h2>
			<ol class="rules-list">
				<li>The integrity of a being is untouchable. Always.</li>
				<li>Separate the person from the position. Always.</li>
				<li>Good faith. Assume it. Earn it.</li>
				<li>Minorities deserve a voice and a safe space.</li>
				<li>Trolls get marked — kindly first, firmly later.</li>
				<li>Qualify yourself. Bring reasoning, bring evidence, bring nuance.</li>
			</ol>
		</section>

		<section class="about-section">
			<h2>What this is not</h2>
			<p>
				Quappe is not a public square for the unwilling. It is not a fighting place — except
				inside the arguments themselves. It is not an exposure of the vulnerable. And it is
				not a substitute for thinking — it is a tool for it.
			</p>
		</section>

		<section class="about-section">
			<h2>Transparency</h2>
			<p>
				A short honest note on what runs where — so you know what you're using.
			</p>
			<ul class="transparency-list">
				<li>
					<strong>Identity.</strong> Anonymous. On first visit your browser mints a
					random UUID and stores it in <code>localStorage</code>. No accounts, no email,
					no cookies for tracking. Clear your storage and you're a new person.
				</li>
				<li>
					<strong>Data storage.</strong> Everything lives in the Node process's memory
					for now. Restart the server and the state is gone (seed data reloads). Phase 2
					will bring real persistence.
				</li>
				<li>
					<strong>Semantic search.</strong> Runs locally. The multilingual e5 embedding
					model (via <code>@xenova/transformers</code>) is downloaded on first server
					start and cached under <code>.cache/</code>. No embeddings ever leave your
					machine.
				</li>
				<li>
					<strong>Reflection reports (<a href="/my">/my</a>, <a href="/pulse">/pulse</a>).</strong>
					Generated by a <em>local</em> LLM via Ollama, if you have it running. Your
					theses, arguments and votes are sent only to <code>http://127.0.0.1:11434</code>
					on your own machine. If Ollama is not running, the pages fall back to raw
					stats — no third-party LLM is ever contacted.
				</li>
				<li>
					<strong>Updates feed.</strong> <a href="/my/updates">/my/updates</a> aggregates
					reactions to your content (forks, new arguments, votes) from the server-side
					data. The "last seen" timestamp lives in <code>localStorage</code>; the badge
					counts anything newer than that.
				</li>
				<li>
					<strong>Daily budget.</strong> Enforced client-side, stored in
					<code>localStorage</code>. The
					<a href="/my#budget">Dein Tag</a> panel reconstructs today's actions from the
					server so you can see where the budget went.
				</li>
				<li>
					<strong>No analytics.</strong> No trackers, no third-party scripts, no
					fingerprinting. The only network traffic is between your browser and this
					Quappe server (and optionally your local Ollama).
				</li>
			</ul>
		</section>

		<section class="about-section">
			<h2>License &amp; policy</h2>
			<p>
				The code is <strong>source-available under a non-commercial license</strong>
				(<a href="https://polyformproject.org/licenses/noncommercial/1.0.0" target="_blank" rel="noopener noreferrer">PolyForm Noncommercial 1.0.0</a>).
			</p>
			<ul class="policy-list">
				<li><span class="ok">✓</span> Personal use, research, hobby projects</li>
				<li><span class="ok">✓</span> Schools, universities, non-profits, public bodies</li>
				<li><span class="ok">✓</span> Forks, patches, sharing changes back</li>
				<li><span class="no">✗</span> Selling it or running it as a paid service</li>
				<li><span class="no">✗</span> Commercial advantage inside a for-profit company</li>
			</ul>
			<p class="policy-note">
				This is deliberately <strong>not OSI-approved open source</strong>. We want the
				code visible and improvable — but we do not want anyone monetising the same
				anti-social patterns we're trying to leave behind.
			</p>
			<p class="policy-links">
				Source and details:
				<a href="https://github.com/quappe-org/quappe" target="_blank" rel="noopener noreferrer">github.com/quappe-org/quappe</a>
			</p>
		</section>

		<footer class="about-footer">
			<a href="/" class="btn btn-primary">Start exploring</a>
		</footer>
	</article>
</section>

<style>
	.about-page {
		display: grid;
		grid-template-columns: 220px 1fr;
		gap: 2.5rem;
		align-items: start;
	}

	@media (max-width: 900px) {
		.about-page {
			grid-template-columns: 1fr;
			gap: 1.5rem;
		}
	}

	.about-visual {
		position: sticky;
		top: 1.5rem;
	}

	.about-visual img {
		width: 100%;
		max-width: 180px;
		height: auto;
		display: block;
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-md);
	}

	.about-content {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.about-content header h1 {
		font-size: var(--text-3xl);
		font-weight: 700;
		letter-spacing: -0.01em;
		margin: 0 0 0.5rem;
	}

	.lead {
		font-size: var(--text-lg);
		color: var(--color-text-muted);
		line-height: 1.6;
		margin: 0;
	}

	.about-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.about-section h2 {
		font-size: var(--text-lg);
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.about-section p {
		color: var(--color-text);
		line-height: 1.65;
		margin: 0;
	}

	.how-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.how-list li {
		padding: 0.625rem 0.875rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-left: 3px solid var(--color-primary);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		line-height: 1.5;
	}

	.rules-list {
		list-style: decimal inside;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.rules-list li {
		padding: 0.625rem 0.875rem;
		background: #fef9c3;
		border: 1px solid #fde68a;
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		line-height: 1.5;
		color: #713f12;
	}

	/* Lifecycle explainer */
	.lifecycle-flow {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.375rem;
		padding: 0.75rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.lc-node {
		display: inline-flex;
		align-items: center;
		padding: 0.25rem 0.625rem;
		font-size: var(--text-xs);
		font-weight: 500;
		border-radius: var(--radius-sm);
		text-transform: capitalize;
		border: 1px solid transparent;
		white-space: nowrap;
	}

	.lc-arrow {
		color: var(--color-text-light);
		font-size: var(--text-sm);
	}

	.lc-arrow-fade {
		color: var(--color-text-light);
		opacity: 0.6;
	}

	.lc-states {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 0.5rem;
		margin: 0;
		padding: 0;
	}

	.lc-state {
		padding: 0.5rem 0.75rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.lc-state dt {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: var(--text-sm);
		font-weight: 600;
		text-transform: capitalize;
		margin-bottom: 0.125rem;
	}

	.lc-state dd {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		line-height: 1.5;
	}

	.lc-dot {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		border: 1px solid transparent;
	}

	.lc-note {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		font-style: italic;
	}

	/* Lifecycle color palette (matches ThesisCard badges) */
	.lc-seedling {
		background: #ecfccb;
		color: #365314;
		border-color: #bef264;
	}
	.lc-discussed {
		background: #dbeafe;
		color: #1e3a8a;
		border-color: #93c5fd;
	}
	.lc-contested {
		background: #fef3c7;
		color: #78350f;
		border-color: #fbbf24;
	}
	.lc-crystallized {
		background: #cffafe;
		color: #164e63;
		border-color: #67e8f9;
	}
	.lc-faded {
		background: #f1f5f9;
		color: #64748b;
		border-color: #cbd5e1;
	}
	.lc-dormant {
		background: #f8fafc;
		color: #94a3b8;
		border-color: #e2e8f0;
	}

	.about-footer {
		margin-top: 0.5rem;
	}

	.policy-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.policy-list li {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		font-size: var(--text-sm);
		line-height: 1.5;
	}

	.policy-list .ok {
		color: var(--color-support);
		font-weight: 700;
	}

	.policy-list .no {
		color: var(--color-reject);
		font-weight: 700;
	}

	.policy-note {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		font-style: italic;
	}

	.policy-links {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.transparency-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.transparency-list li {
		padding: 0.625rem 0.875rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-left: 3px solid var(--color-text-muted);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		line-height: 1.55;
	}

	.transparency-list code {
		font-family: var(--font-mono);
		font-size: 0.85em;
		background: var(--color-bg);
		padding: 0.05rem 0.3rem;
		border-radius: var(--radius-sm);
	}
</style>
