import React, { useMemo, useState } from 'react'

function PeopleList({ people, onExile }) {
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [showModal, setShowModal] = useState(false)
  
  // 이미지 파일들을 동적으로 가져오기
  const imageFiles = useMemo(() => {
    const images = import.meta.glob('/images/**/*.jpg', { eager: true })
    
    const categorizedImages = {
      'male': [],
      'female': [],
      'boy': [],
      'girl': []
    }
    
    // 파일 경로를 카테고리별로 분류
    Object.keys(images).forEach(path => {
      const fileName = path.split('/').pop()
      if (path.includes('/male/')) {
        categorizedImages.male.push(fileName)
      } else if (path.includes('/female/')) {
        categorizedImages.female.push(fileName)
      } else if (path.includes('/boy/')) {
        categorizedImages.boy.push(fileName)
      } else if (path.includes('/girl/')) {
        categorizedImages.girl.push(fileName)
      }
    })
    
    return categorizedImages
  }, [])

  // 성별과 나이에 따른 이미지 경로 생성
  const getPortraitPath = (gender, age) => {
    let folder = ''
    if (age < 12) {
      folder = gender === 'male' ? 'boy' : 'girl'
    } else {
      folder = gender === 'male' ? 'male' : 'female'
    }
    
    const files = imageFiles[folder] || []
    if (files.length === 0) {
      // 이미지가 없을 경우 기본 아이콘 사용
      return null
    }
    
    const randomFile = files[Math.floor(Math.random() * files.length)]
    return `/images/${folder}/${randomFile}`
  }

  // 사람의 초상화 경로를 결정하는 함수
  const getPersonPortrait = (person) => {
    // 성인 여부에 따라 다른 키 생성 (성인이 될 때만 변경)
    const isAdult = person.age >= 12
    const folder = isAdult ? (person.gender === 'male' ? 'male' : 'female') : (person.gender === 'male' ? 'boy' : 'girl')
    
    const files = imageFiles[folder] || []
    if (files.length === 0) {
      // 이미지가 없을 경우 기본 아이콘 사용
      return null
    }
    
    // person.id를 기반으로 결정적 선택 (같은 사람은 항상 같은 이미지)
    const index = person.id % files.length
    const selectedFile = files[index]
    
    return `/images/${folder}/${selectedFile}`
  }

  const getAgeColor = (age) => {
    if (age < 12) return '#3498db' // 어린이
    if (age > 65) return '#e67e22' // 노인
    return '#2c3e50' // 성인
  }

  const getCardBackgroundColor = (person) => {
    const { gender, age } = person
    
    if (age > 65) {
      return 'rgba(192, 192, 192, 0.7)' // 노인 - 은색 (투명도 70%)
    } else if (age >= 12) {
      // 성인
      return gender === 'male' ? 'rgba(44, 62, 80, 0.7)' : 'rgba(149, 165, 166, 0.7)' // 남자 - 검정색, 여자 - 회색 (투명도 70%)
    } else {
      // 어린이
      return gender === 'male' ? 'rgba(135, 206, 235, 0.7)' : 'rgba(255, 182, 193, 0.7)' // 남자아이 - 하늘색, 여자아이 - 분홍색 (투명도 70%)
    }
  }

  const getCardTextColor = (person) => {
    const { gender, age } = person
    
    if (age > 65) {
      return '#2c3e50' // 노인 - 어두운 색
    } else if (age >= 12) {
      // 성인
      return gender === 'male' ? '#ffffff' : '#2c3e50' // 남자 - 흰색, 여자 - 어두운 색
    } else {
      // 어린이
      return gender === 'male' ? '#2c3e50' : '#2c3e50' // 둘 다 어두운 색
    }
  }

  const getLaborText = (labor) => {
    if (labor === 0) return '노동 불가'
    return `${labor}인분`
  }

  const handleExile = (personId, personName) => {
    onExile(personId)
  }

  const handleCardClick = (person) => {
    setSelectedPerson(person)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setSelectedPerson(null)
  }

  const handleModalExile = () => {
    if (selectedPerson) {
      onExile(selectedPerson.id)
      closeModal()
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
          height: '632px',
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
                  backgroundColor: getCardBackgroundColor(person),
                  color: getCardTextColor(person),
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  position: 'relative'
                }}
                onClick={() => handleCardClick(person)}
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
                    {portraitPath ? (
                      <img 
                        src={portraitPath}
                        alt={`${person.name}의 초상화`}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover'
                        }}
                        onError={(e) => {
                          e.target.style.display = 'none'
                          e.target.nextSibling.style.display = 'block'
                        }}
                      />
                    ) : null}
                    {/* 이미지 로드 실패 시 또는 이미지가 없을 때 대체 아이콘 */}
                    <div style={{
                      display: portraitPath ? 'none' : 'flex',
                      width: '100%',
                      height: '100%',
                      fontSize: '20px',
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
                    color: getCardTextColor(person),
                    fontSize: '11px',
                    textAlign: 'center',
                    marginBottom: '2px',
                    lineHeight: '1.1'
                  }}>
                    {person.name}
                  </div>
                  
                  {/* 나이 */}
                  <div style={{ 
                    color: getCardTextColor(person),
                    fontSize: '10px',
                    marginBottom: '2px'
                  }}>
                    {person.age}세
                  </div>
                  
                  {/* 추방 버튼 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleExile(person.id, person.name)
                    }}
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
                </div>
              )
            })}
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

      {/* 상세 프로필 모달 */}
      {showModal && selectedPerson && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}
        onClick={closeModal}
        >
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '30px',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto',
            position: 'relative'
          }}
          onClick={(e) => e.stopPropagation()}
          >
            {/* 닫기 버튼 */}
            <button
              onClick={closeModal}
              style={{
                position: 'absolute',
                top: '15px',
                right: '20px',
                background: 'none',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                color: '#666'
              }}
            >
              ×
            </button>

            <div style={{ textAlign: 'center' }}>
              {/* 확대된 초상화 */}
              <div style={{
                width: '120px',
                height: '120px',
                margin: '0 auto 20px',
                borderRadius: '50%',
                overflow: 'hidden',
                border: '4px solid #bdc3c7',
                filter: selectedPerson.labor === 0 ? 'grayscale(50%)' : 'none'
              }}>
                {getPersonPortrait(selectedPerson) ? (
                  <img 
                    src={getPersonPortrait(selectedPerson)}
                    alt={`${selectedPerson.name}의 초상화`}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover'
                    }}
                  />
                ) : (
                  <div style={{
                    width: '100%',
                    height: '100%',
                    fontSize: '60px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#ecf0f1'
                  }}>
                    {selectedPerson.gender === 'male' ? '👨' : '👩'}
                  </div>
                )}
              </div>

              {/* 이름 */}
              <h2 style={{
                margin: '0 0 10px 0',
                color: '#2c3e50',
                fontSize: '24px'
              }}>
                {selectedPerson.name}
              </h2>

              {/* 기본 정보 */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '15px',
                marginBottom: '25px',
                textAlign: 'left'
              }}>
                <div>
                  <strong>나이:</strong> {selectedPerson.age}세
                </div>
                <div>
                  <strong>성별:</strong> {selectedPerson.gender === 'male' ? '남성' : '여성'}
                </div>
                <div>
                  <strong>노동력:</strong> {selectedPerson.labor > 0 ? `${selectedPerson.labor}인분` : '노동 불가'}
                </div>
                <div>
                  <strong>노동 가능:</strong> {selectedPerson.labor > 0 ? '✅' : '❌'}
                </div>
              </div>

              {/* 나이대별 정보 */}
              <div style={{
                backgroundColor: '#f8f9fa',
                padding: '15px',
                borderRadius: '8px',
                marginBottom: '25px',
                textAlign: 'left'
              }}>
                <h3 style={{ margin: '0 0 10px 0', color: '#2c3e50' }}>나이대별 정보</h3>
                {selectedPerson.age < 12 && (
                  <p style={{ margin: 0, color: '#666' }}>
                    어린이입니다. 아직 노동에 참여할 수 없습니다.
                  </p>
                )}
                {selectedPerson.age >= 12 && selectedPerson.age < 15 && (
                  <p style={{ margin: 0, color: '#666' }}>
                    청소년입니다. 아직 노동에 참여할 수 없습니다.
                  </p>
                )}
                {selectedPerson.age >= 15 && selectedPerson.age <= 65 && (
                  <p style={{ margin: 0, color: '#666' }}>
                    성인입니다. 노동에 참여할 수 있습니다.
                  </p>
                )}
                {selectedPerson.age > 65 && (
                  <p style={{ margin: 0, color: '#666' }}>
                    노인입니다. 노동에 참여할 수 없습니다.
                  </p>
                )}
              </div>

              {/* 추방 버튼 */}
              <button
                onClick={handleModalExile}
                style={{
                  backgroundColor: '#e74c3c',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '12px 24px',
                  fontSize: '16px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                  width: '100%'
                }}
                onMouseOver={(e) => e.target.style.backgroundColor = '#c0392b'}
                onMouseOut={(e) => e.target.style.backgroundColor = '#e74c3c'}
              >
                마을에서 추방하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PeopleList
