import Head from 'next/head'
import type { GetServerSideProps } from 'next'
import { FormEvent, useCallback, useState } from 'react'

import AdminLayout from '../components/AdminLayout'
import type {
  CtaContent,
  FaqItem,
  HeroContent,
  HomepageContent,
  HomepageCopy,
  PersonaContent,
  ResourceLink,
  WorkflowStep,
} from '../../frontend/lib/homepage'
import { getHomepageContent } from '../../frontend/lib/homepage'
import type { SessionUser } from '../../frontend/lib/session'
import { getSessionFromRequest } from '../../frontend/lib/session'

type HomepageManagerProps = {
  user: SessionUser
  initialContent: HomepageContent
}

type StatusState = { state: 'idle' | 'saving' | 'success' | 'error'; message: string }

const defaultStatus: StatusState = { state: 'idle', message: '' }

const newPersona = (): PersonaContent => ({
  key: `persona-${Date.now()}`,
  label: '',
  headline: '',
  benefits: [''],
})

const newWorkflowStep = (index: number): WorkflowStep => ({
  step: String(index + 1).padStart(2, '0'),
  title: '',
  copy: '',
})

const newResource = (): ResourceLink => ({ title: '', description: '', href: '' })

const newFaq = (): FaqItem => ({ question: '', answer: '' })

const updateSection = async <T,>(section: string, content: T, setStatus: (value: StatusState) => void) => {
  setStatus({ state: 'saving', message: '' })
  try {
    const response = await fetch('/api/homepage', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section, content }),
    })
    if (!response.ok) {
      throw new Error('Request failed')
    }
    setStatus({ state: 'success', message: 'Saved successfully' })
    setTimeout(() => setStatus(defaultStatus), 2500)
  } catch (error) {
    setStatus({ state: 'error', message: error instanceof Error ? error.message : 'Unable to save changes' })
  }
}

const HomepageManager = ({ user, initialContent }: HomepageManagerProps): JSX.Element => {
  const [hero, setHero] = useState<HeroContent>(initialContent.hero)
  const [pageCopy, setPageCopy] = useState<HomepageCopy>(initialContent.copy)
  const [personas, setPersonas] = useState<PersonaContent[]>(initialContent.personas)
  const [workflow, setWorkflow] = useState<WorkflowStep[]>(initialContent.workflow)
  const [resources, setResources] = useState<ResourceLink[]>(initialContent.resources)
  const [faqs, setFaqs] = useState<FaqItem[]>(initialContent.faqs)
  const [cta, setCta] = useState<CtaContent>(initialContent.cta)

  const [heroStatus, setHeroStatus] = useState<StatusState>(defaultStatus)
  const [copyStatus, setCopyStatus] = useState<StatusState>(defaultStatus)
  const [personaStatus, setPersonaStatus] = useState<StatusState>(defaultStatus)
  const [workflowStatus, setWorkflowStatus] = useState<StatusState>(defaultStatus)
  const [resourceStatus, setResourceStatus] = useState<StatusState>(defaultStatus)
  const [faqStatus, setFaqStatus] = useState<StatusState>(defaultStatus)
  const [ctaStatus, setCtaStatus] = useState<StatusState>(defaultStatus)

  const handleHeroSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      await updateSection('hero', hero, setHeroStatus)
    },
    [hero],
  )

  const handlePersonasSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const sanitized = personas.map((persona, index) => ({
        ...persona,
        key: persona.key || `persona-${index}`,
        benefits: persona.benefits.map((benefit) => benefit.trim()).filter((benefit) => benefit.length > 0),
      }))
      await updateSection('personas', sanitized, setPersonaStatus)
      setPersonas(sanitized)
    },
    [personas],
  )

  const handleWorkflowSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const sanitized = workflow.map((step, index) => ({
        ...step,
        step: String(index + 1).padStart(2, '0'),
        title: step.title.trim(),
        copy: step.copy.trim(),
      }))
      await updateSection('workflow', sanitized, setWorkflowStatus)
      setWorkflow(sanitized)
    },
    [workflow],
  )

  const handleCopySubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const sanitized: HomepageCopy = {
        featuresHeading: pageCopy.featuresHeading.trim(),
        featuresDescription: pageCopy.featuresDescription.trim(),
        workflowHeading: pageCopy.workflowHeading.trim(),
        workflowDescription: pageCopy.workflowDescription.trim(),
        workflowCta: {
          label: pageCopy.workflowCta.label.trim(),
          href: pageCopy.workflowCta.href.trim(),
        },
        testimonialsHeading: pageCopy.testimonialsHeading.trim(),
        testimonialsDescription: pageCopy.testimonialsDescription.trim(),
        resourcesHeading: pageCopy.resourcesHeading.trim(),
        resourcesDescription: pageCopy.resourcesDescription.trim(),
        faqHeading: pageCopy.faqHeading.trim(),
        faqDescription: pageCopy.faqDescription.trim(),
      }
      await updateSection('copy', sanitized, setCopyStatus)
      setPageCopy(sanitized)
    },
    [pageCopy],
  )

  const handleResourcesSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const sanitized = resources.map((resource) => ({
        title: resource.title.trim(),
        description: resource.description.trim(),
        href: resource.href.trim(),
      }))
      await updateSection('resources', sanitized, setResourceStatus)
      setResources(sanitized)
    },
    [resources],
  )

  const handleFaqSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const sanitized = faqs.map((faq) => ({
        question: faq.question.trim(),
        answer: faq.answer.trim(),
      }))
      await updateSection('faqs', sanitized, setFaqStatus)
      setFaqs(sanitized)
    },
    [faqs],
  )

  const handleCtaSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const sanitized: CtaContent = {
        title: cta.title.trim(),
        copy: cta.copy.trim(),
        primaryCta: { label: cta.primaryCta.label.trim(), href: cta.primaryCta.href.trim() },
        secondaryCta: { label: cta.secondaryCta.label.trim(), href: cta.secondaryCta.href.trim() },
      }
      await updateSection('cta', sanitized, setCtaStatus)
      setCta(sanitized)
    },
    [cta],
  )

  const addPersona = () => {
    setPersonas((current) => [...current, newPersona()])
  }

  const removePersona = (key: string) => {
    setPersonas((current) => current.filter((persona) => persona.key !== key))
  }

  const addBenefit = (index: number) => {
    setPersonas((current) => {
      const draft = [...current]
      draft[index] = { ...draft[index], benefits: [...draft[index].benefits, ''] }
      return draft
    })
  }

  const updateBenefit = (personaIndex: number, benefitIndex: number, value: string) => {
    setPersonas((current) => {
      const draft = [...current]
      const benefits = [...draft[personaIndex].benefits]
      benefits[benefitIndex] = value
      draft[personaIndex] = { ...draft[personaIndex], benefits }
      return draft
    })
  }

  const removeBenefit = (personaIndex: number, benefitIndex: number) => {
    setPersonas((current) => {
      const draft = [...current]
      const benefits = draft[personaIndex].benefits.filter((_, index) => index !== benefitIndex)
      draft[personaIndex] = { ...draft[personaIndex], benefits }
      return draft
    })
  }

  const addWorkflowStep = () => {
    setWorkflow((current) => [...current, newWorkflowStep(current.length)])
  }

  const removeWorkflowStep = (index: number) => {
    setWorkflow((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  const addResource = () => setResources((current) => [...current, newResource()])

  const removeResource = (index: number) => {
    setResources((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  const addFaq = () => setFaqs((current) => [...current, newFaq()])

  const removeFaq = (index: number) => {
    setFaqs((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  const renderStatus = (status: StatusState) => {
    if (status.state === 'success') {
      return <p className="admin-success" role="status">{status.message}</p>
    }
    if (status.state === 'error') {
      return <p className="admin-error" role="alert">{status.message || 'Unable to save changes'}</p>
    }
    return null
  }

  return (
    <AdminLayout user={user}>
      <Head>
        <title>Homepage content</title>
      </Head>
      <section className="admin-section" aria-labelledby="hero-manager">
        <header className="admin-section__header">
          <div>
            <h1 id="hero-manager" className="admin-section__title">
              Homepage hero &amp; messaging
            </h1>
            <p className="admin-section__description">
              Control what buyers, sellers, and conveyancers see when they first arrive on the marketplace.
            </p>
          </div>
        </header>
        <form className="admin-form" onSubmit={handleHeroSubmit}>
          <label className="admin-form__label">
            Badge text
            <input
              className="admin-input"
              value={hero.badge}
              onChange={(event) => setHero((current) => ({ ...current, badge: event.target.value }))}
              required
            />
          </label>
          <label className="admin-form__label">
            Headline
            <input
              className="admin-input"
              value={hero.title}
              onChange={(event) => setHero((current) => ({ ...current, title: event.target.value }))}
              required
            />
          </label>
          <label className="admin-form__label admin-form__label--span">
            Subheading
            <textarea
              className="admin-textarea"
              rows={3}
              value={hero.subtitle}
              onChange={(event) => setHero((current) => ({ ...current, subtitle: event.target.value }))}
              required
            />
          </label>
          <div className="admin-form__grid">
            <label className="admin-form__label">
              Primary CTA label
              <input
                className="admin-input"
                value={hero.primaryCta.label}
                onChange={(event) =>
                  setHero((current) => ({ ...current, primaryCta: { ...current.primaryCta, label: event.target.value } }))
                }
                required
              />
            </label>
            <label className="admin-form__label">
              Primary CTA link
              <input
                className="admin-input"
                value={hero.primaryCta.href}
                onChange={(event) =>
                  setHero((current) => ({ ...current, primaryCta: { ...current.primaryCta, href: event.target.value } }))
                }
                required
              />
            </label>
          </div>
          <div className="admin-form__grid">
            <label className="admin-form__label">
              Secondary CTA label
              <input
                className="admin-input"
                value={hero.secondaryCta.label}
                onChange={(event) =>
                  setHero((current) => ({ ...current, secondaryCta: { ...current.secondaryCta, label: event.target.value } }))
                }
                required
              />
            </label>
            <label className="admin-form__label">
              Secondary CTA link
              <input
                className="admin-input"
                value={hero.secondaryCta.href}
                onChange={(event) =>
                  setHero((current) => ({ ...current, secondaryCta: { ...current.secondaryCta, href: event.target.value } }))
                }
                required
              />
            </label>
          </div>
          <div className="admin-form__actions">
            <button type="submit" className="admin-button" disabled={heroStatus.state === 'saving'}>
              {heroStatus.state === 'saving' ? 'Saving…' : 'Save hero content'}
            </button>
            {renderStatus(heroStatus)}
          </div>
        </form>
      </section>

      <section className="admin-section" aria-labelledby="copy-manager">
        <header className="admin-section__header">
          <div>
            <h2 id="copy-manager" className="admin-section__title">Section headings &amp; descriptions</h2>
            <p className="admin-section__description">
              Update the supporting copy that appears throughout the homepage experience.
            </p>
          </div>
        </header>
        <form className="admin-form" onSubmit={handleCopySubmit}>
          <fieldset className="admin-fieldset">
            <legend>Features</legend>
            <label className="admin-form__label">
              Heading
              <input
                className="admin-input"
                value={pageCopy.featuresHeading}
                onChange={(event) =>
                  setPageCopy((current) => ({ ...current, featuresHeading: event.target.value }))
                }
                required
              />
            </label>
            <label className="admin-form__label admin-form__label--span">
              Description
              <textarea
                className="admin-textarea"
                rows={3}
                value={pageCopy.featuresDescription}
                onChange={(event) =>
                  setPageCopy((current) => ({ ...current, featuresDescription: event.target.value }))
                }
              />
            </label>
          </fieldset>

          <fieldset className="admin-fieldset">
            <legend>Workflow overview</legend>
            <label className="admin-form__label">
              Heading
              <input
                className="admin-input"
                value={pageCopy.workflowHeading}
                onChange={(event) =>
                  setPageCopy((current) => ({ ...current, workflowHeading: event.target.value }))
                }
                required
              />
            </label>
            <label className="admin-form__label admin-form__label--span">
              Description
              <textarea
                className="admin-textarea"
                rows={3}
                value={pageCopy.workflowDescription}
                onChange={(event) =>
                  setPageCopy((current) => ({ ...current, workflowDescription: event.target.value }))
                }
                required
              />
            </label>
            <div className="admin-form__grid">
              <label className="admin-form__label">
                CTA label
                <input
                  className="admin-input"
                  value={pageCopy.workflowCta.label}
                  onChange={(event) =>
                    setPageCopy((current) => ({
                      ...current,
                      workflowCta: { ...current.workflowCta, label: event.target.value },
                    }))
                  }
                  required
                />
              </label>
              <label className="admin-form__label">
                CTA link
                <input
                  className="admin-input"
                  value={pageCopy.workflowCta.href}
                  onChange={(event) =>
                    setPageCopy((current) => ({
                      ...current,
                      workflowCta: { ...current.workflowCta, href: event.target.value },
                    }))
                  }
                  required
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="admin-fieldset">
            <legend>Testimonials</legend>
            <label className="admin-form__label">
              Heading
              <input
                className="admin-input"
                value={pageCopy.testimonialsHeading}
                onChange={(event) =>
                  setPageCopy((current) => ({ ...current, testimonialsHeading: event.target.value }))
                }
                required
              />
            </label>
            <label className="admin-form__label admin-form__label--span">
              Description
              <textarea
                className="admin-textarea"
                rows={3}
                value={pageCopy.testimonialsDescription}
                onChange={(event) =>
                  setPageCopy((current) => ({
                    ...current,
                    testimonialsDescription: event.target.value,
                  }))
                }
              />
            </label>
          </fieldset>

          <fieldset className="admin-fieldset">
            <legend>Resources</legend>
            <label className="admin-form__label">
              Heading
              <input
                className="admin-input"
                value={pageCopy.resourcesHeading}
                onChange={(event) =>
                  setPageCopy((current) => ({ ...current, resourcesHeading: event.target.value }))
                }
                required
              />
            </label>
            <label className="admin-form__label admin-form__label--span">
              Description
              <textarea
                className="admin-textarea"
                rows={3}
                value={pageCopy.resourcesDescription}
                onChange={(event) =>
                  setPageCopy((current) => ({
                    ...current,
                    resourcesDescription: event.target.value,
                  }))
                }
                required
              />
            </label>
          </fieldset>

          <fieldset className="admin-fieldset">
            <legend>FAQ introduction</legend>
            <label className="admin-form__label">
              Heading
              <input
                className="admin-input"
                value={pageCopy.faqHeading}
                onChange={(event) =>
                  setPageCopy((current) => ({ ...current, faqHeading: event.target.value }))
                }
                required
              />
            </label>
            <label className="admin-form__label admin-form__label--span">
              Description
              <textarea
                className="admin-textarea"
                rows={3}
                value={pageCopy.faqDescription}
                onChange={(event) =>
                  setPageCopy((current) => ({ ...current, faqDescription: event.target.value }))
                }
                required
              />
            </label>
          </fieldset>

          <div className="admin-form__actions">
            <button type="submit" className="admin-button" disabled={copyStatus.state === 'saving'}>
              {copyStatus.state === 'saving' ? 'Saving…' : 'Save section copy'}
            </button>
            {renderStatus(copyStatus)}
          </div>
        </form>
      </section>

      <section className="admin-section" aria-labelledby="persona-manager">
        <header className="admin-section__header">
          <div>
            <h2 id="persona-manager" className="admin-section__title">
              Personas &amp; benefits
            </h2>
            <p className="admin-section__description">
              Tailor the marketplace value proposition for each audience segment.
            </p>
          </div>
          <button type="button" className="admin-button" onClick={addPersona}>
            Add persona
          </button>
        </header>
        <form className="admin-form" onSubmit={handlePersonasSubmit}>
          {personas.map((persona, index) => (
            <fieldset key={persona.key || `persona-${index}`} className="admin-fieldset">
              <legend>Persona {index + 1}</legend>
              <div className="admin-form__grid">
                <label className="admin-form__label">
                  Identifier
                  <input
                    className="admin-input"
                    value={persona.key}
                    onChange={(event) => {
                      const value = event.target.value
                      setPersonas((current) => {
                        const draft = [...current]
                        draft[index] = { ...draft[index], key: value }
                        return draft
                      })
                    }}
                    required
                  />
                </label>
                <label className="admin-form__label">
                  Label
                  <input
                    className="admin-input"
                    value={persona.label}
                    onChange={(event) => {
                      const value = event.target.value
                      setPersonas((current) => {
                        const draft = [...current]
                        draft[index] = { ...draft[index], label: value }
                        return draft
                      })
                    }}
                    required
                  />
                </label>
              </div>
              <label className="admin-form__label admin-form__label--span">
                Headline
                <input
                  className="admin-input"
                  value={persona.headline}
                  onChange={(event) => {
                    const value = event.target.value
                    setPersonas((current) => {
                      const draft = [...current]
                      draft[index] = { ...draft[index], headline: value }
                      return draft
                    })
                  }}
                  required
                />
              </label>
              <div className="admin-repeatable">
                <p className="admin-repeatable__label">Benefits</p>
                {persona.benefits.map((benefit, benefitIndex) => (
                  <div key={`${persona.key}-benefit-${benefitIndex}`} className="admin-repeatable__item">
                    <input
                      className="admin-input"
                      value={benefit}
                      onChange={(event) => updateBenefit(index, benefitIndex, event.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="admin-button admin-button--danger"
                      onClick={() => removeBenefit(index, benefitIndex)}
                      disabled={persona.benefits.length <= 1}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button type="button" className="admin-button" onClick={() => addBenefit(index)}>
                  Add benefit
                </button>
              </div>
              <button
                type="button"
                className="admin-button admin-button--danger"
                onClick={() => removePersona(persona.key)}
                disabled={personas.length <= 1}
              >
                Remove persona
              </button>
            </fieldset>
          ))}
          <div className="admin-form__actions">
            <button type="submit" className="admin-button" disabled={personaStatus.state === 'saving'}>
              {personaStatus.state === 'saving' ? 'Saving…' : 'Save personas'}
            </button>
            {renderStatus(personaStatus)}
          </div>
        </form>
      </section>

      <section className="admin-section" aria-labelledby="workflow-manager">
        <header className="admin-section__header">
          <div>
            <h2 id="workflow-manager" className="admin-section__title">
              Workflow timeline
            </h2>
            <p className="admin-section__description">
              Define the steps buyers and sellers can expect during a settlement journey.
            </p>
          </div>
          <button type="button" className="admin-button" onClick={addWorkflowStep}>
            Add step
          </button>
        </header>
        <form className="admin-form" onSubmit={handleWorkflowSubmit}>
          {workflow.map((step, index) => (
            <fieldset key={`workflow-${index}`} className="admin-fieldset">
              <legend>Step {index + 1}</legend>
              <label className="admin-form__label">
                Title
                <input
                  className="admin-input"
                  value={step.title}
                  onChange={(event) => {
                    const value = event.target.value
                    setWorkflow((current) => {
                      const draft = [...current]
                      draft[index] = { ...draft[index], title: value }
                      return draft
                    })
                  }}
                  required
                />
              </label>
              <label className="admin-form__label admin-form__label--span">
                Copy
                <textarea
                  className="admin-textarea"
                  rows={3}
                  value={step.copy}
                  onChange={(event) => {
                    const value = event.target.value
                    setWorkflow((current) => {
                      const draft = [...current]
                      draft[index] = { ...draft[index], copy: value }
                      return draft
                    })
                  }}
                  required
                />
              </label>
              <button
                type="button"
                className="admin-button admin-button--danger"
                onClick={() => removeWorkflowStep(index)}
                disabled={workflow.length <= 1}
              >
                Remove step
              </button>
            </fieldset>
          ))}
          <div className="admin-form__actions">
            <button type="submit" className="admin-button" disabled={workflowStatus.state === 'saving'}>
              {workflowStatus.state === 'saving' ? 'Saving…' : 'Save workflow'}
            </button>
            {renderStatus(workflowStatus)}
          </div>
        </form>
      </section>

      <section className="admin-section" aria-labelledby="resources-manager">
        <header className="admin-section__header">
          <div>
            <h2 id="resources-manager" className="admin-section__title">
              Resource library
            </h2>
            <p className="admin-section__description">
              Publish downloadable guides surfaced on the public marketplace.
            </p>
          </div>
          <button type="button" className="admin-button" onClick={addResource}>
            Add resource
          </button>
        </header>
        <form className="admin-form" onSubmit={handleResourcesSubmit}>
          {resources.map((resource, index) => (
            <fieldset key={`resource-${index}`} className="admin-fieldset">
              <legend>Resource {index + 1}</legend>
              <label className="admin-form__label">
                Title
                <input
                  className="admin-input"
                  value={resource.title}
                  onChange={(event) => {
                    const value = event.target.value
                    setResources((current) => {
                      const draft = [...current]
                      draft[index] = { ...draft[index], title: value }
                      return draft
                    })
                  }}
                  required
                />
              </label>
              <label className="admin-form__label">
                Description
                <textarea
                  className="admin-textarea"
                  rows={3}
                  value={resource.description}
                  onChange={(event) => {
                    const value = event.target.value
                    setResources((current) => {
                      const draft = [...current]
                      draft[index] = { ...draft[index], description: value }
                      return draft
                    })
                  }}
                  required
                />
              </label>
              <label className="admin-form__label">
                Link URL
                <input
                  className="admin-input"
                  value={resource.href}
                  onChange={(event) => {
                    const value = event.target.value
                    setResources((current) => {
                      const draft = [...current]
                      draft[index] = { ...draft[index], href: value }
                      return draft
                    })
                  }}
                  required
                />
              </label>
              <button
                type="button"
                className="admin-button admin-button--danger"
                onClick={() => removeResource(index)}
                disabled={resources.length <= 1}
              >
                Remove resource
              </button>
            </fieldset>
          ))}
          <div className="admin-form__actions">
            <button type="submit" className="admin-button" disabled={resourceStatus.state === 'saving'}>
              {resourceStatus.state === 'saving' ? 'Saving…' : 'Save resources'}
            </button>
            {renderStatus(resourceStatus)}
          </div>
        </form>
      </section>

      <section className="admin-section" aria-labelledby="faq-manager">
        <header className="admin-section__header">
          <div>
            <h2 id="faq-manager" className="admin-section__title">
              Frequently asked questions
            </h2>
            <p className="admin-section__description">
              Surface your most important compliance and workflow messaging.
            </p>
          </div>
          <button type="button" className="admin-button" onClick={addFaq}>
            Add FAQ
          </button>
        </header>
        <form className="admin-form" onSubmit={handleFaqSubmit}>
          {faqs.map((faq, index) => (
            <fieldset key={`faq-${index}`} className="admin-fieldset">
              <legend>FAQ {index + 1}</legend>
              <label className="admin-form__label">
                Question
                <input
                  className="admin-input"
                  value={faq.question}
                  onChange={(event) => {
                    const value = event.target.value
                    setFaqs((current) => {
                      const draft = [...current]
                      draft[index] = { ...draft[index], question: value }
                      return draft
                    })
                  }}
                  required
                />
              </label>
              <label className="admin-form__label">
                Answer
                <textarea
                  className="admin-textarea"
                  rows={3}
                  value={faq.answer}
                  onChange={(event) => {
                    const value = event.target.value
                    setFaqs((current) => {
                      const draft = [...current]
                      draft[index] = { ...draft[index], answer: value }
                      return draft
                    })
                  }}
                  required
                />
              </label>
              <button
                type="button"
                className="admin-button admin-button--danger"
                onClick={() => removeFaq(index)}
                disabled={faqs.length <= 1}
              >
                Remove FAQ
              </button>
            </fieldset>
          ))}
          <div className="admin-form__actions">
            <button type="submit" className="admin-button" disabled={faqStatus.state === 'saving'}>
              {faqStatus.state === 'saving' ? 'Saving…' : 'Save FAQs'}
            </button>
            {renderStatus(faqStatus)}
          </div>
        </form>
      </section>

      <section className="admin-section" aria-labelledby="cta-manager">
        <header className="admin-section__header">
          <div>
            <h2 id="cta-manager" className="admin-section__title">
              Closing call to action
            </h2>
            <p className="admin-section__description">
              Configure the final section on the homepage to drive conversions.
            </p>
          </div>
        </header>
        <form className="admin-form" onSubmit={handleCtaSubmit}>
          <label className="admin-form__label">
            Title
            <input
              className="admin-input"
              value={cta.title}
              onChange={(event) => setCta((current) => ({ ...current, title: event.target.value }))}
              required
            />
          </label>
          <label className="admin-form__label">
            Supporting copy
            <textarea
              className="admin-textarea"
              rows={3}
              value={cta.copy}
              onChange={(event) => setCta((current) => ({ ...current, copy: event.target.value }))}
              required
            />
          </label>
          <div className="admin-form__grid">
            <label className="admin-form__label">
              Primary CTA label
              <input
                className="admin-input"
                value={cta.primaryCta.label}
                onChange={(event) =>
                  setCta((current) => ({ ...current, primaryCta: { ...current.primaryCta, label: event.target.value } }))
                }
                required
              />
            </label>
            <label className="admin-form__label">
              Primary CTA link
              <input
                className="admin-input"
                value={cta.primaryCta.href}
                onChange={(event) =>
                  setCta((current) => ({ ...current, primaryCta: { ...current.primaryCta, href: event.target.value } }))
                }
                required
              />
            </label>
          </div>
          <div className="admin-form__grid">
            <label className="admin-form__label">
              Secondary CTA label
              <input
                className="admin-input"
                value={cta.secondaryCta.label}
                onChange={(event) =>
                  setCta((current) => ({ ...current, secondaryCta: { ...current.secondaryCta, label: event.target.value } }))
                }
                required
              />
            </label>
            <label className="admin-form__label">
              Secondary CTA link
              <input
                className="admin-input"
                value={cta.secondaryCta.href}
                onChange={(event) =>
                  setCta((current) => ({ ...current, secondaryCta: { ...current.secondaryCta, href: event.target.value } }))
                }
                required
              />
            </label>
          </div>
          <div className="admin-form__actions">
            <button type="submit" className="admin-button" disabled={ctaStatus.state === 'saving'}>
              {ctaStatus.state === 'saving' ? 'Saving…' : 'Save call to action'}
            </button>
            {renderStatus(ctaStatus)}
          </div>
        </form>
      </section>
    </AdminLayout>
  )
}

export const getServerSideProps: GetServerSideProps<HomepageManagerProps> = async ({ req }) => {
  const user = getSessionFromRequest(req)
  if (!user || user.role !== 'admin') {
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    }
  }

  const initialContent = getHomepageContent()
  return { props: { user, initialContent } }
}

export default HomepageManager
