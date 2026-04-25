# Bootstrap Setup Guide

Bootstrap 5 has been added to your Laboracle project!

## What's Included

### 1. Bootstrap CSS Framework (v5.3.2)
- Responsive grid system
- Pre-built components
- Utility classes
- Modern design

### 2. React-Bootstrap (v2.10.0)
- React components for Bootstrap
- No jQuery dependency
- Full TypeScript support

### 3. Bootstrap Icons
- 2,000+ free icons
- Loaded via CDN in `index.html`

## Installation

Already added to `package.json`. Just run:

```bash
npm install
```

This installs:
- `bootstrap` - Core CSS and JS
- `react-bootstrap` - React components

## Usage Examples

### Using Bootstrap CSS Classes

```jsx
function MyComponent() {
  return (
    <div className="container">
      <div className="row">
        <div className="col-md-6">
          <button className="btn btn-primary">Click Me</button>
        </div>
      </div>
    </div>
  );
}
```

### Using React-Bootstrap Components

```jsx
import { Button, Card, Container } from 'react-bootstrap';

function MyComponent() {
  return (
    <Container>
      <Card>
        <Card.Body>
          <Card.Title>Title</Card.Title>
          <Card.Text>Content here</Card.Text>
          <Button variant="primary">Action</Button>
        </Card.Body>
      </Card>
    </Container>
  );
}
```

### Using Bootstrap Icons

```jsx
function MyComponent() {
  return (
    <div>
      <i className="bi bi-heart-fill"></i>
      <i className="bi bi-star"></i>
      <i className="bi bi-person-circle"></i>
    </div>
  );
}
```

## Common Bootstrap Classes

### Layout
```css
.container          /* Responsive container */
.container-fluid    /* Full-width container */
.row               /* Row */
.col, .col-md-6    /* Columns */
```

### Buttons
```css
.btn .btn-primary   /* Primary button */
.btn .btn-secondary /* Secondary button */
.btn .btn-success   /* Success button */
.btn .btn-lg        /* Large button */
.btn .btn-sm        /* Small button */
```

### Text & Colors
```css
.text-primary      /* Primary color text */
.text-center       /* Center text */
.text-end          /* Right align text */
.bg-primary        /* Primary background */
.bg-light          /* Light background */
```

### Spacing (Margin & Padding)
```css
.m-3               /* Margin all sides */
.mt-3              /* Margin top */
.mb-3              /* Margin bottom */
.p-3               /* Padding all sides */
.pt-3              /* Padding top */
.mx-auto           /* Center horizontally */
```

### Display & Flexbox
```css
.d-flex            /* Display flex */
.justify-content-center   /* Center content */
.align-items-center       /* Align items center */
.flex-column       /* Column direction */
```

## Bootstrap Icons Examples

### Common Icons
```html
<!-- User & Profile -->
<i class="bi bi-person"></i>
<i class="bi bi-person-circle"></i>
<i class="bi bi-people"></i>

<!-- Education -->
<i class="bi bi-book"></i>
<i class="bi bi-journal"></i>
<i class="bi bi-mortarboard"></i>

<!-- Actions -->
<i class="bi bi-arrow-right"></i>
<i class="bi bi-check-circle"></i>
<i class="bi bi-x-circle"></i>
<i class="bi bi-trash"></i>
<i class="bi bi-pencil"></i>

<!-- Communication -->
<i class="bi bi-chat"></i>
<i class="bi bi-chat-dots"></i>
<i class="bi bi-send"></i>

<!-- Files -->
<i class="bi bi-file-earmark"></i>
<i class="bi bi-file-pdf"></i>
<i class="bi bi-upload"></i>
<i class="bi bi-download"></i>
```

### Icon Sizes
```html
<i class="bi bi-star" style="font-size: 2rem;"></i>
<i class="bi bi-star fs-1"></i>  <!-- Bootstrap font-size utility -->
```

### Colored Icons
```html
<i class="bi bi-heart-fill text-danger"></i>
<i class="bi bi-star-fill text-warning"></i>
<i class="bi bi-check-circle text-success"></i>
```

## React-Bootstrap Components

### Button
```jsx
import { Button } from 'react-bootstrap';

<Button variant="primary">Primary</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="success">Success</Button>
<Button size="lg">Large</Button>
<Button size="sm">Small</Button>
```

### Card
```jsx
import { Card } from 'react-bootstrap';

<Card>
  <Card.Header>Header</Card.Header>
  <Card.Body>
    <Card.Title>Title</Card.Title>
    <Card.Text>Some text content</Card.Text>
  </Card.Body>
</Card>
```

### Form
```jsx
import { Form, Button } from 'react-bootstrap';

<Form>
  <Form.Group className="mb-3">
    <Form.Label>Email</Form.Label>
    <Form.Control type="email" placeholder="Enter email" />
  </Form.Group>
  
  <Form.Group className="mb-3">
    <Form.Label>Password</Form.Label>
    <Form.Control type="password" placeholder="Password" />
  </Form.Group>
  
  <Button variant="primary" type="submit">
    Submit
  </Button>
</Form>
```

### Modal
```jsx
import { Modal, Button } from 'react-bootstrap';
import { useState } from 'react';

function MyModal() {
  const [show, setShow] = useState(false);

  return (
    <>
      <Button onClick={() => setShow(true)}>Open Modal</Button>

      <Modal show={show} onHide={() => setShow(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Modal Title</Modal.Title>
        </Modal.Header>
        <Modal.Body>Modal content here</Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShow(false)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
```

### Alert
```jsx
import { Alert } from 'react-bootstrap';

<Alert variant="success">Success message!</Alert>
<Alert variant="danger">Error message!</Alert>
<Alert variant="warning">Warning message!</Alert>
```

### Badge
```jsx
import { Badge } from 'react-bootstrap';

<h1>Heading <Badge bg="secondary">New</Badge></h1>
<Badge bg="primary">Primary</Badge>
<Badge bg="success">Success</Badge>
```

### Spinner
```jsx
import { Spinner } from 'react-bootstrap';

<Spinner animation="border" />
<Spinner animation="grow" />
<Spinner animation="border" size="sm" />
```

### Navbar
```jsx
import { Navbar, Nav, Container } from 'react-bootstrap';

<Navbar bg="dark" variant="dark" expand="lg">
  <Container>
    <Navbar.Brand href="/">Brand</Navbar.Brand>
    <Navbar.Toggle />
    <Navbar.Collapse>
      <Nav className="ms-auto">
        <Nav.Link href="/home">Home</Nav.Link>
        <Nav.Link href="/about">About</Nav.Link>
      </Nav>
    </Navbar.Collapse>
  </Container>
</Navbar>
```

## Grid System

Bootstrap uses a 12-column grid:

```jsx
<Container>
  <Row>
    <Col md={6}>50% width on medium+</Col>
    <Col md={6}>50% width on medium+</Col>
  </Row>
  
  <Row>
    <Col md={4}>33.33% width</Col>
    <Col md={4}>33.33% width</Col>
    <Col md={4}>33.33% width</Col>
  </Row>
</Container>
```

### Breakpoints
- `xs` - Extra small (< 576px)
- `sm` - Small (≥ 576px)
- `md` - Medium (≥ 768px)
- `lg` - Large (≥ 992px)
- `xl` - Extra large (≥ 1200px)
- `xxl` - Extra extra large (≥ 1400px)

## Customization

Your custom CSS (in your `.css` files) will override Bootstrap styles:

```css
/* Your custom styles take precedence */
.btn-primary {
  background-color: #667eea !important;
}
```

## Resources

- **Bootstrap Docs**: https://getbootstrap.com/docs/5.3/
- **React-Bootstrap Docs**: https://react-bootstrap.github.io/
- **Bootstrap Icons**: https://icons.getbootstrap.com/
- **Examples**: https://getbootstrap.com/docs/5.3/examples/

## Benefits

✅ **Responsive Design** - Mobile-first grid system  
✅ **Pre-built Components** - Buttons, cards, modals, etc.  
✅ **Utility Classes** - Quick styling without custom CSS  
✅ **Consistent Design** - Professional look and feel  
✅ **Time Saving** - Less CSS to write  
✅ **Accessibility** - ARIA attributes built-in  

## Example Usage in Your Project

### Update a Button
```jsx
// Before
<button className="auth-button">Login</button>

// After (with Bootstrap)
<Button variant="primary" size="lg" className="w-100">
  Login
</Button>
```

### Update Form
```jsx
// Before
<input type="email" placeholder="Email" />

// After (with Bootstrap)
<Form.Control 
  type="email" 
  placeholder="Email"
  className="mb-3"
/>
```

### Add Icons
```jsx
// Buttons with icons
<Button variant="primary">
  <i className="bi bi-send me-2"></i>
  Send
</Button>

// User avatar
<i className="bi bi-person-circle" style={{ fontSize: '2rem' }}></i>
```

---

**Bootstrap is now ready to use!** You can mix Bootstrap classes with your existing custom CSS. 🎨
