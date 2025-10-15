import React, { useEffect, useState } from 'react'

export default function Search(){
  const [list, setList] = useState<any[]>([])
  useEffect(()=>{
    fetch('/api/profiles/search').then(r=>r.json()).then(setList)
  },[])
  return (
    <main style={{padding:24}}>
      <h2>Verified conveyancers</h2>
      <ul>{list.map((p,i)=>(<li key={i}>{p.name} — {p.state} {p.verified?'✔':''}</li>))}</ul>
    </main>
  )
}
