import React, { useMemo } from 'react'

function PeopleList({ people, onExile }) {
  // 성별과 나이에 따른 이미지 경로 생성
  const getPortraitPath = (gender, age) => {
    let folder = ''
    if (age < 12) {
      folder = gender === 'male' ? 'boy' : 'girl'
    } else {
      folder = gender === 'male' ? 'male' : 'female'
    }
    
    // 각 폴더의 이미지 파일명 배열
    const imageFiles = {
      'male': [
        '2025-08-13_00037_.png', '2025-08-13_00038_.png', '2025-08-13_00039_.png',
        '2025-08-13_00040_.png', '2025-08-13_00041_.png', '2025-08-13_00042_.png',
        '2025-08-13_00043_.png', '2025-08-13_00044_.png', '2025-08-13_00045_.png',
        '2025-08-13_00046_.png', '2025-08-13_00047_.png', '2025-08-13_00048_.png',
        '2025-08-13_00049_.png'
      ],
      'female': [
        '2025-08-13_00050_.png', '2025-08-13_00051_.png', '2025-08-13_00052_.png',
        '2025-08-13_00053_.png', '2025-08-13_00054_.png', '2025-08-13_00055_.png',
        '2025-08-13_00056_.png', '2025-08-13_00057_.png', '2025-08-13_00058_.png',
        '2025-08-13_00059_.png', '2025-08-13_00060_.png', '2025-08-13_00061_.png',
        '2025-08-13_00062_.png', '2025-08-13_00063_.png', '2025-08-13_00064_.png',
        '2025-08-13_00065_.png', '2025-08-13_00066_.png', '2025-08-13_00067_.png',
        '2025-08-13_00068_.png', '2025-08-13_00069_.png', '2025-08-13_00070_.png',
        '2025-08-13_00071_.png', '2025-08-13_00072_.png'
      ],
      'boy': [
        '2025-08-13_00090_.png'
      ],
      'girl': [
        '2025-08-13_00073_.png', '2025-08-13_00074_.png', '2025-08-13_00075_.png',
        '2025-08-13_00076_.png', '2025-08-13_00077_.png', '2025-08-13_00078_.png',
        '2025-08-13_00079_.png', '2025-08-13_00080_.png', '2025-08-13_00081_.png',
        '2025-08-13_00082_.png', '2025-08-13_00083_.png', '2025-08-13_00084_.png',
        '2025-08-13_00085_.png', '2025-08-13_00087_.png', '2025-08-13_00088_.png',
        '2025-08-13_00089_.png', '2025-08-13_00091_.png', '2025-08-13_00093_.png'
      ]
    }
    
    const files = imageFiles[folder]
    const randomFile = files[Math.floor(Math.random() * files.length)]
    
    return `/images/${folder}/${randomFile}`
  }

  // 사람의 초상화 경로를 결정하는 함수 (useMemo와 함께 사용)
  const getPersonPortrait = (person) => {
    return useMemo(() => {
      // 성인 여부에 따라 다른 키 생성 (성인이 될 때만 변경)
      const isAdult = person.age >= 12
      const portraitKey = `${person.gender}_${isAdult ? 'adult' : 'child'}`
      
      // Math.random()을 사용하지 않고 person.id를 기반으로 결정적 선택
      const folder = isAdult ? (person.gender === 'male' ? 'male' : 'female') : (person.gender === 'male' ? 'boy' : 'girl')
      
      const imageFiles = {
        'male': [
          '2025-08-13_00037_.png', '2025-08-13_00038_.png', '2025-08-13_00039_.png',
          '2025-08-13_00040_.png', '2025-08-13_00041_.png', '2025-08-13_00042_.png',
          '2025-08-13_00043_.png', '2025-08-13_00044_.png', '2025-08-13_00045_.png',
          '2025-08-13_00046_.png', '2025-08-13_00047_.png', '2025-08-13_00048_.png',
          '2025-08-13_00049_.png'
        ],
        'female': [
          '2025-08-13_00050_.png', '2025-08-13_00051_.png', '2025-08-13_00052_.png',
          '2025-08-13_00053_.png', '2025-08-13_00054_.png', '2025-08-13_00055_.png',
          '2025-08-13_00056_.png', '2025-08-13_00057_.png', '2025-08-13_00058_.png',
          '2025-08-13_00059_.png', '2025-08-13_00060_.png', '2025-08-13_00061_.png',
          '2025-08-13_00062_.png', '2025-08-13_00063_.png', '2025-08-13_00064_.png',
          '2025-08-13_00065_.png', '2025-08-13_00066_.png', '2025-08-13_00067_.png',
          '2025-08-13_00068_.png', '2025-08-13_00069_.png', '2025-08-13_00070_.png',
          '2025-08-13_00071_.png', '2025-08-13_00072_.png'
        ],
        'boy': [
          '2025-08-13_00090_.png'
        ],
        'girl': [
          '2025-08-13_00073_.png', '2025-08-13_00074_.png', '2025-08-13_00075_.png',
          '2025-08-13_00076_.png', '2025-08-13_00077_.png', '2025-08-13_00078_.png',
          '2025-08-13_00079_.png', '2025-08-13_00080_.png', '2025-08-13_00081_.png',
          '2025-08-13_00082_.png', '2025-08-13_00083_.png', '2025-08-13_00084_.png',
          '2025-08-13_00085_.png', '2025-08-13_00087_.png', '2025-08-13_00088_.png',
          '2025-08-13_00089_.png', '2025-08-13_00091_.png', '2025-08-13_00093_.png'
        ]
      }
      
      const files = imageFiles[folder]
      // person.id를 기반으로 결정적 선택 (같은 사람은 항상 같은 이미지)
      const index = person.id % files.length
      const selectedFile = files[index]
      
      return `/images/${folder}/${selectedFile}`
    }, [person.id, person.gender, person.age >= 12])
  }

  const getAgeColor = (age) => {
    if (age < 12) return '#3498db' // 어린이
    if (age > 65) return '#e67e22' // 노인
    return '#2c3e50' // 성인
  }

  const getLaborText = (labor) => {
    if (labor === 0) return '노동 불가'
    return `${labor}인분`
  }

  const handleExile = (personId, personName) => {
    onExile(personId)
  }

  return (
    <div style={{
      border: '2px solid #34495e',
      borderRadius: '8px',
      padding: '20px',
      backgroundColor: '#ecf0f1'
    }}>
      <h2 style={{ margin: '0 0 15px 0', color: '#2c3e50' }}>
        마을 사람들 ({people.length}명)
      </h2>
      
      {people.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#7f8c8d', padding: '20px' }}>
          마을에 사람이 없습니다.
        </div>
      ) : (
        <div style={{ 
          height: '632px', // 화면 높이에 맞춰 동적 조정
          minHeight: '400px',
          overflowY: 'auto',
          border: '1px solid #bdc3c7',
          borderRadius: '4px',
          backgroundColor: 'white',
          padding: '15px'
        }}>
                     <div style={{
             display: 'grid',
             gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
             gap: '6px',
             alignItems: 'start'
           }}>
            {people.map(person => {
              const portraitPath = getPersonPortrait(person)
              return (
                             <div key={person.id} style={{
                 display: 'flex',
                 flexDirection: 'column',
                 alignItems: 'center',
                 padding: '6px 4px',
                 border: `2px solid ${person.labor > 0 ? '#27ae60' : '#e74c3c'}`,
                 borderRadius: '6px',
                 backgroundColor: person.labor > 0 ? '#f8f9fa' : '#fff5f5',
                 cursor: 'pointer',
                 transition: 'all 0.2s',
                 position: 'relative'
               }}
              onMouseOver={(e) => {
                e.target.style.transform = 'scale(1.05)'
                e.target.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)'
              }}
              onMouseOut={(e) => {
                e.target.style.transform = 'scale(1)'
                e.target.style.boxShadow = 'none'
              }}
              >
                                 {/* 초상화 이미지 */}
                 <div style={{ 
                   width: '40px',
                   height: '40px',
                   marginBottom: '3px',
                   borderRadius: '50%',
                   overflow: 'hidden',
                   border: '2px solid #bdc3c7',
                   filter: person.labor === 0 ? 'grayscale(50%)' : 'none'
                 }}>
                   <img 
                     src={portraitPath}
                     alt={`${person.name}의 초상화`}
                     style={{
                       width: '100%',
                       height: '100%',
                       objectFit: 'cover'
                     }}
                     onError={(e) => {
                       // 이미지 로드 실패 시 기본 아이콘 표시
                       e.target.style.display = 'none'
                       e.target.nextSibling.style.display = 'block'
                     }}
                   />
                   {/* 이미지 로드 실패 시 대체 아이콘 */}
                   <div style={{
                     display: 'none',
                     width: '100%',
                     height: '100%',
                     fontSize: '20px',
                     display: 'flex',
                     alignItems: 'center',
                     justifyContent: 'center',
                     backgroundColor: '#ecf0f1'
                   }}>
                     {person.gender === 'male' ? '👨' : '👩'}
                   </div>
                 </div>
                 
                 {/* 이름 */}
                 <div style={{ 
                   fontWeight: 'bold', 
                   color: getAgeColor(person.age),
                   fontSize: '11px',
                   textAlign: 'center',
                   marginBottom: '2px',
                   lineHeight: '1.1'
                 }}>
                   {person.name}
                 </div>
                 
                 {/* 나이 */}
                 <div style={{ 
                   color: getAgeColor(person.age),
                   fontSize: '10px',
                   marginBottom: '2px'
                 }}>
                   {person.age}세
                 </div>
                 
                 {/* 노동력 */}
                 <div style={{ 
                   color: person.labor > 0 ? '#27ae60' : '#e74c3c',
                   fontSize: '10px',
                   fontWeight: 'bold',
                   marginBottom: '4px'
                 }}>
                   {getLaborText(person.labor)}
                 </div>
                
                                 {/* 추방 버튼 */}
                 <button
                   onClick={() => handleExile(person.id, person.name)}
                   style={{
                     backgroundColor: '#e74c3c',
                     color: 'white',
                     border: 'none',
                     borderRadius: '3px',
                     padding: '2px 4px',
                     fontSize: '9px',
                     cursor: 'pointer',
                     transition: 'background-color 0.2s',
                     width: '100%'
                   }}
                   onMouseOver={(e) => e.target.style.backgroundColor = '#c0392b'}
                   onMouseOut={(e) => e.target.style.backgroundColor = '#e74c3c'}
                 >
                   추방
                 </button>
                
                                 {/* 노동 불가 표시 */}
                 {person.labor === 0 && (
                   <div style={{
                     position: 'absolute',
                     top: '2px',
                     right: '2px',
                     backgroundColor: '#e74c3c',
                     color: 'white',
                     borderRadius: '50%',
                     width: '10px',
                     height: '10px',
                     fontSize: '7px',
                     display: 'flex',
                     alignItems: 'center',
                     justifyContent: 'center'
                   }}>
                     ⚠️
                   </div>
                 )}
              </div>
            )})}
          </div>
        </div>
      )}
      
      <div style={{ 
        marginTop: '15px', 
        fontSize: '11px', 
        color: '#7f8c8d',
        textAlign: 'center',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span>💡 노동력: 남성 3인분, 여성 1인분 (15-65세만)</span>
        <span>📊 총 {people.length}명</span>
      </div>
    </div>
  )
}

export default PeopleList
