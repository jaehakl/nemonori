import React from 'react'

function PeopleList({ people, onExile }) {
  const getGenderIcon = (gender) => {
    return gender === 'male' ? '👨' : '👩'
  }

  const getAgeColor = (age) => {
    if (age < 15) return '#3498db' // 어린이
    if (age > 60) return '#e67e22' // 노인
    return '#2c3e50' // 성인
  }

  const getLaborText = (labor) => {
    if (labor === 0) return '노동 불가'
    return `${labor}인분`
  }

  const handleExile = (personId, personName) => {
    if (window.confirm(`${personName}을(를) 정말로 추방하시겠습니까?`)) {
      onExile(personId)
    }
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
          maxHeight: '400px', 
          overflowY: 'auto',
          border: '1px solid #bdc3c7',
          borderRadius: '4px',
          backgroundColor: 'white'
        }}>
          {people.map(person => (
            <div key={person.id} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px',
              borderBottom: '1px solid #ecf0f1',
              backgroundColor: person.labor > 0 ? '#f8f9fa' : '#fff5f5'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>{getGenderIcon(person.gender)}</span>
                <div>
                  <div style={{ 
                    fontWeight: 'bold', 
                    color: getAgeColor(person.age),
                    fontSize: '14px'
                  }}>
                    {person.name}
                  </div>
                  <div style={{ 
                    fontSize: '12px', 
                    color: '#7f8c8d',
                    display: 'flex',
                    gap: '10px'
                  }}>
                    <span>{person.age}세</span>
                    <span>{person.gender === 'male' ? '남성' : '여성'}</span>
                    <span style={{ 
                      color: person.labor > 0 ? '#27ae60' : '#e74c3c',
                      fontWeight: 'bold'
                    }}>
                      {getLaborText(person.labor)}
                    </span>
                  </div>
                </div>
              </div>
              
              <button
                onClick={() => handleExile(person.id, person.name)}
                style={{
                  backgroundColor: '#e74c3c',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '5px 10px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => e.target.style.backgroundColor = '#c0392b'}
                onMouseOut={(e) => e.target.style.backgroundColor = '#e74c3c'}
              >
                추방
              </button>
            </div>
          ))}
        </div>
      )}
      
      <div style={{ 
        marginTop: '15px', 
        fontSize: '12px', 
        color: '#7f8c8d',
        textAlign: 'center'
      }}>
        💡 노동력: 남성 2인분, 여성 1인분 (15-60세만)
      </div>
    </div>
  )
}

export default PeopleList
