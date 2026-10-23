import { useState } from 'react'
import styles from './PreSessionForm.module.css'

interface PreSessionData {
	clientName: string
	industry: string
	contextNotes: string
}

const initialFormData: PreSessionData = {
	clientName: '',
	industry: '',
	contextNotes: '',
}

export default function PreSessionForm() {
	const [formData, setFormData] = useState<PreSessionData>(initialFormData)
	const [submitted, setSubmitted] = useState(false)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [error, setError] = useState('')

	function handleChange(
		event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
	) {
		setFormData((currentData) => ({
			...currentData,
			[event.target.name]: event.target.value,
		}))
		setError('')
	}

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault()

		if (!formData.clientName.trim() || !formData.industry.trim()) {
			setError('Please fill in the client name and industry.')
			return
		}

		setIsSubmitting(true)
		setError('')

		try {
			const response = await fetch('/api/pre-session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					...formData,
					clientName: formData.clientName.trim(),
					industry: formData.industry.trim(),
				}),
			})

			if (!response.ok) {
				throw new Error('Pre-session request failed')
			}

			setSubmitted(true)
		} catch (submissionError) {
			console.error('Pre-session submit error:', submissionError)
			setError('Could not reach the server. Please try again.')
		} finally {
			setIsSubmitting(false)
		}
	}

	if (submitted) {
		return (
			<section className={styles.success} aria-live="polite">
				<span className={styles.successMark} aria-hidden="true">+</span>
				<p className={styles.eyebrow}>Brief received</p>
				<h2>Nova is ready for {formData.clientName}.</h2>
				<p className={styles.successCopy}>Your session context has been loaded.</p>
			</section>
		)
	}

	return (
		<section className={styles.container}>
			<div className={styles.intro}>
				<p className={styles.eyebrow}>Session setup</p>
				<h1>Give Nova the room.</h1>
				<p>Set the context before the conversation begins.</p>
			</div>

			<form className={styles.form} onSubmit={handleSubmit} noValidate>
				<div className={styles.field}>
					  <label htmlFor="clientName">Client Name</label>
					<input
						id="clientName"
						name="clientName"
						type="text"
						value={formData.clientName}
						onChange={handleChange}
						placeholder="e.g. BMW North America"
						autoComplete="organization"
						required
					/>
				</div>

				<div className={styles.field}>
					<label htmlFor="industry">Industry</label>
					<input
						id="industry"
						name="industry"
						type="text"
						value={formData.industry}
						onChange={handleChange}
						placeholder="e.g. Automotive"
						required
					/>
				</div>

				<div className={styles.field}>
					  <label htmlFor="contextNotes">Context Notes</label>
					<textarea
						id="contextNotes"
						name="contextNotes"
						value={formData.contextNotes}
						onChange={handleChange}
						placeholder="What is this client here to discuss? Any key talking points or sensitivities?"
						rows={4}
					/>
				</div>

				{error && <p className={styles.error} role="alert">{error}</p>}

				<button className={styles.submit} type="submit" disabled={isSubmitting}>
					  {isSubmitting ? 'Priming Nova...' : 'Prime Nova'}
				</button>
			</form>
		</section>
	)
}
