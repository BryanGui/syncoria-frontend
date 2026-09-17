import type { ReactNode } from 'react'

export interface SelectableListOption {
  description?: ReactNode
  disabled?: boolean
  title: ReactNode
  value: string
  status?: ReactNode
}

interface SelectableListProps {
  ariaLabel: string
  name: string
  onChange: (value: string, checked: boolean) => void
  options: SelectableListOption[]
  selectedValues?: string[]
  selectedValue?: string
  type?: 'checkbox' | 'radio'
}

export function SelectableList({
  ariaLabel,
  name,
  onChange,
  options,
  selectedValues,
  selectedValue,
  type = 'radio',
}: SelectableListProps) {
  return (
    <div aria-label={ariaLabel} className="ui-selectable-list" role={type === 'radio' ? 'radiogroup' : undefined}>
      {options.map((option) => {
        const isSelected = selectedValue === option.value || selectedValues?.includes(option.value) === true
        return (
          <label
            className={`ui-selectable-list__row${isSelected ? ' ui-selectable-list__row--selected' : ''}${option.disabled ? ' ui-selectable-list__row--disabled' : ''}`}
            key={option.value}
          >
            <input
              checked={isSelected}
              disabled={option.disabled}
              name={name}
              onChange={(event) => onChange(option.value, event.currentTarget.checked)}
              type={type}
              value={option.value}
            />
            <span className="ui-selectable-list__copy">
              <strong>{option.title}</strong>
              {option.description ? <span>{option.description}</span> : null}
            </span>
            {option.status ? <span className="ui-selectable-list__status">{option.status}</span> : null}
          </label>
        )
      })}
    </div>
  )
}
