# Quick Bootstrap Examples for Your Laboracle

Here are some ready-to-use Bootstrap enhancements for your specific components:

## 1. Login/Signup Buttons

### Current vs Bootstrap
```jsx
// Add to Login.jsx
import { Button, Form } from 'react-bootstrap';

// Replace button
<Button 
  variant="primary" 
  type="submit" 
  size="lg" 
  className="w-100 mt-3"
>
  Login
</Button>

// Add loading state
<Button 
  variant="primary" 
  disabled={isLoading}
  className="w-100"
>
  {isLoading ? (
    <>
      <span className="spinner-border spinner-border-sm me-2"></span>
      Loading...
    </>
  ) : 'Login'}
</Button>
```

## 2. Form Inputs

```jsx
import { Form } from 'react-bootstrap';

<Form.Group className="mb-3">
  <Form.Label>Email address</Form.Label>
  <Form.Control 
    type="email"
    placeholder="Enter email"
    value={formData.email}
    onChange={handleChange}
    isInvalid={!!errors.email}
  />
  <Form.Control.Feedback type="invalid">
    {errors.email}
  </Form.Control.Feedback>
</Form.Group>
```

## 3. Navigation Buttons (DocumentUpload)

```jsx
import { ButtonGroup, Button } from 'react-bootstrap';

// Role Switch
<ButtonGroup>
  <Button 
    variant={userRole === 'student' ? 'primary' : 'outline-primary'}
    onClick={() => setUserRole('student')}
  >
    <i className="bi bi-person me-2"></i>
    Student
  </Button>
  <Button 
    variant={userRole === 'teacher' ? 'primary' : 'outline-primary'}
    onClick={() => setUserRole('teacher')}
  >
    <i className="bi bi-person-workspace me-2"></i>
    Teacher
  </Button>
</ButtonGroup>
```

## 4. File Upload with Bootstrap Icons

```jsx
<div className="text-center p-5 border border-2 border-dashed rounded">
  <i className="bi bi-cloud-upload display-1 text-primary"></i>
  <h5 className="mt-3">Upload Course Materials</h5>
  <p className="text-muted">Drag & drop or click to browse</p>
  <p className="small text-muted">PDF, DOC, DOCX, TXT, CSV</p>
</div>
```

## 5. Chat Messages with Badges

```jsx
import { Badge } from 'react-bootstrap';

// Confidence Badge
<Badge 
  bg={confidence >= 90 ? 'success' : confidence >= 75 ? 'warning' : 'danger'}
  className="me-2"
>
  {confidence}% Confidence
</Badge>

// Citation Badge
<Badge bg="info" pill className="me-1">
  <i className="bi bi-book me-1"></i>
  Source: Page 5
</Badge>
```

## 6. Alert Messages

```jsx
import { Alert } from 'react-bootstrap';

// Success message
<Alert variant="success" dismissible>
  <i className="bi bi-check-circle me-2"></i>
  Document uploaded successfully!
</Alert>

// Error message
<Alert variant="danger">
  <i className="bi bi-exclamation-triangle me-2"></i>
  Please upload a document first.
</Alert>
```

## 7. Loading Spinner

```jsx
import { Spinner } from 'react-bootstrap';

// In chat when typing
<div className="d-flex align-items-center">
  <Spinner animation="border" size="sm" className="me-2" />
  <span>Searching curriculum database...</span>
</div>
```

## 8. Cards for Features (MainPage)

```jsx
import { Card, Row, Col } from 'react-bootstrap';

<Row className="g-4">
  <Col md={4}>
    <Card className="h-100 border-0 shadow-sm">
      <Card.Body className="text-center">
        <i className="bi bi-book display-4 text-primary mb-3"></i>
        <Card.Title>Course Q&A</Card.Title>
        <Card.Text>
          Get instant answers about your curriculum with citations.
        </Card.Text>
      </Card.Body>
    </Card>
  </Col>
  {/* Repeat for other features */}
</Row>
```

## 9. Navbar for Header

```jsx
import { Navbar, Container, Nav, Button } from 'react-bootstrap';

<Navbar bg="white" expand="lg" className="shadow-sm">
  <Container>
    <Navbar.Brand href="/">
      <i className="bi bi-mortarboard me-2"></i>
      Laboracle
    </Navbar.Brand>
    <Navbar.Toggle />
    <Navbar.Collapse className="justify-content-end">
      <Nav>
        <Nav.Link href="#features">Features</Nav.Link>
        <Nav.Link href="#how-it-works">How It Works</Nav.Link>
      </Nav>
      <Button variant="outline-primary" className="ms-2 me-2" href="/login">
        Login
      </Button>
      <Button variant="primary" href="/signup">
        Sign Up
      </Button>
    </Navbar.Collapse>
  </Container>
</Navbar>
```

## 10. Toast Notifications

```jsx
import { Toast, ToastContainer } from 'react-bootstrap';
import { useState } from 'react';

function Notification() {
  const [show, setShow] = useState(true);

  return (
    <ToastContainer position="top-end" className="p-3">
      <Toast show={show} onClose={() => setShow(false)} delay={3000} autohide>
        <Toast.Header>
          <i className="bi bi-check-circle-fill text-success me-2"></i>
          <strong className="me-auto">Success</strong>
        </Toast.Header>
        <Toast.Body>Document uploaded successfully!</Toast.Body>
      </Toast>
    </ToastContainer>
  );
}
```

## 11. Progress Bar for Upload

```jsx
import { ProgressBar } from 'react-bootstrap';

<ProgressBar 
  now={uploadProgress} 
  label={`${uploadProgress}%`}
  animated
  striped
  variant="success"
/>
```

## 12. Dropdown Menu

```jsx
import { Dropdown } from 'react-bootstrap';

<Dropdown>
  <Dropdown.Toggle variant="outline-secondary">
    <i className="bi bi-person-circle me-2"></i>
    Profile
  </Dropdown.Toggle>

  <Dropdown.Menu>
    <Dropdown.Item>
      <i className="bi bi-gear me-2"></i>
      Settings
    </Dropdown.Item>
    <Dropdown.Item>
      <i className="bi bi-box-arrow-right me-2"></i>
      Logout
    </Dropdown.Item>
  </Dropdown.Menu>
</Dropdown>
```

## 13. List Group for Files

```jsx
import { ListGroup, Badge } from 'react-bootstrap';

<ListGroup>
  {files.map(file => (
    <ListGroup.Item 
      key={file.id}
      className="d-flex justify-content-between align-items-center"
    >
      <div>
        <i className="bi bi-file-earmark-pdf me-2"></i>
        {file.name}
      </div>
      <div>
        <Badge bg="success" className="me-2">
          <i className="bi bi-check"></i>
        </Badge>
        <Button variant="danger" size="sm">
          <i className="bi bi-trash"></i>
        </Button>
      </div>
    </ListGroup.Item>
  ))}
</ListGroup>
```

## 14. Tabs for AI Modes

```jsx
import { Tabs, Tab } from 'react-bootstrap';

<Tabs
  activeKey={aiMode}
  onSelect={(k) => setAiMode(k)}
  className="mb-3"
>
  <Tab eventKey="deterministic" title="Deterministic">
    Factual answers only
  </Tab>
  <Tab eventKey="exploratory" title="Exploratory">
    Creative insights
  </Tab>
</Tabs>
```

## 15. Suggested Questions as Pills

```jsx
import { Stack, Badge } from 'react-bootstrap';

<Stack direction="horizontal" gap={2} className="flex-wrap">
  <Badge 
    bg="light" 
    text="primary" 
    className="p-2 cursor-pointer"
    onClick={() => setMessage('What is the program about?')}
  >
    <i className="bi bi-lightbulb me-1"></i>
    Program Overview
  </Badge>
  <Badge 
    bg="light" 
    text="primary" 
    className="p-2 cursor-pointer"
    onClick={() => setMessage('How do missions work?')}
  >
    <i className="bi bi-controller me-1"></i>
    Mission Structure
  </Badge>
</Stack>
```

## Common Bootstrap Icons for Your App

```jsx
// Education
<i className="bi bi-mortarboard"></i>        // Graduation
<i className="bi bi-book"></i>                // Book
<i className="bi bi-journal"></i>             // Journal
<i className="bi bi-file-text"></i>           // Document

// People
<i className="bi bi-person"></i>              // Person
<i className="bi bi-person-circle"></i>       // User avatar
<i className="bi bi-people"></i>              // Group

// Actions
<i className="bi bi-send"></i>                // Send
<i className="bi bi-upload"></i>              // Upload
<i className="bi bi-download"></i>            // Download
<i className="bi bi-trash"></i>               // Delete
<i className="bi bi-pencil"></i>              // Edit

// Status
<i className="bi bi-check-circle"></i>        // Success
<i className="bi bi-x-circle"></i>            // Error
<i className="bi bi-exclamation-triangle"></i> // Warning
<i className="bi bi-info-circle"></i>         // Info

// Navigation
<i className="bi bi-arrow-left"></i>          // Back
<i className="bi bi-arrow-right"></i>         // Forward
<i className="bi bi-house"></i>               // Home
```

---

**Quick Start**: Install packages and start using these examples!

```bash
npm install
npm run dev
```
