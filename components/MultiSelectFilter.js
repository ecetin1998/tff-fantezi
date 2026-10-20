'use client'

import {useEffect,useId,useMemo,useRef,useState} from 'react'

/**
 * Shared check-box filter. An empty selection means "all", whereas sort,
 * week, formation and manager-card selectors intentionally remain single.
 */
export default function MultiSelectFilter({
  options=[],value=[],onChange,placeholder='Tümü',ariaLabel,
  searchable=false,disabled=false,className=''
}){
  const [open,setOpen]=useState(false)
  const [search,setSearch]=useState('')
  const ref=useRef(null)
  const panelId=useId()
  const selected=Array.isArray(value)?value:[]
  const selectedSet=useMemo(()=>new Set(selected),[selected])
  const normalized=String(search).toLocaleLowerCase('tr').trim()
  const displayed=normalized?options.filter(o=>String(o.label).toLocaleLowerCase('tr').includes(normalized)):options
  const selectedOptions=options.filter(o=>selectedSet.has(o.value))
  const summary=selectedOptions.length===0?placeholder:selectedOptions.length===1?selectedOptions[0].label:
    `${selectedOptions.length} seçili`

  useEffect(()=>{
    if(!open)return
    const onPointerDown=e=>{
      if(ref.current&&!ref.current.contains(e.target))setOpen(false)
    }
    const onKeyDown=e=>{
      if(e.key==='Escape'){
        setOpen(false)
        ref.current?.querySelector('.multi-filter-trigger')?.focus()
      }
    }
    document.addEventListener('pointerdown',onPointerDown)
    document.addEventListener('keydown',onKeyDown)
    return()=>{
      document.removeEventListener('pointerdown',onPointerDown)
      document.removeEventListener('keydown',onKeyDown)
    }
  },[open])

  const toggle=optionValue=>{
    const next=selectedSet.has(optionValue)?
      selected.filter(v=>v!==optionValue):[...selected,optionValue]
    onChange(next)
  }
  return <div ref={ref} className={['multi-filter',selected.length?'is-active-filter':'',open?'is-open':'',className].filter(Boolean).join(' ')}>
    <button type="button" className="multi-filter-trigger"
      disabled={disabled} aria-label={ariaLabel||placeholder}
      aria-expanded={open} aria-controls={panelId} aria-haspopup="true"
      onClick={()=>{setOpen(o=>!o);setSearch('')}}>
      <span className="multi-filter-title" title={selectedOptions.map(o=>o.label).join(', ')||placeholder}>{summary}</span>
      <span aria-hidden="true" className="multi-filter-arrow">⌄</span>
    </button>
    {open?<div className="multi-filter-panel" id={panelId} role="group" aria-label={ariaLabel||placeholder}>
      <div className="multi-filter-panel-top">
        <span>Birden fazla seçebilirsin</span>
        {selected.length?<button type="button" className="multi-filter-reset" onClick={()=>onChange([])}>Temizle</button>:null}
      </div>
      {searchable&&options.length>7?<input
        className="multi-filter-search" type="search" autoFocus
        placeholder="Listede ara..." aria-label="Filtre seçeneklerinde ara"
        value={search} onChange={e=>setSearch(e.target.value)}/>:null}
      <div className="multi-filter-options">
        {displayed.map(option=><label key={option.value} className={selectedSet.has(option.value)?'multi-filter-option selected':'multi-filter-option'}>
          <input type="checkbox" checked={selectedSet.has(option.value)} onChange={()=>toggle(option.value)}/>
          <span>{option.label}</span>
        </label>)}
        {!displayed.length?<span className="multi-filter-empty">Sonuç bulunamadı</span>:null}
      </div>
      <div className="multi-filter-footer">
        <button type="button" onClick={()=>onChange(options.map(o=>o.value))}>Hepsini seç</button>
        <button type="button" className="multi-filter-done" onClick={()=>setOpen(false)}>Tamam</button>
      </div>
    </div>:null}
  </div>
}
